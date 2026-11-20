import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { env } from "cloudflare:workers";
import {
  gatewayRefusal,
  integrationFetch,
  integrationStatus,
} from "@every-app/sdk/server";
import { z } from "zod";
import { db } from "@/db";
import { assets, generations } from "@/db/schema";
import {
  ACCEPTED_TYPES,
  KINDS,
  MAX_IN_FLIGHT,
  modelById,
  type GenerationParams,
  type MediaKind,
} from "@/shared/models";
import { getOwnedAsset } from "./assets";
import { getProject, touchProject } from "./projects";

const REPLICATE = "https://api.replicate.com";
/** Starting frames go to the provider inline; larger images are refused. */
const MAX_START_FRAME_BYTES = 10 * 1024 * 1024;
const IN_FLIGHT = ["queued", "running"] as const;

export const startGenerationInput = z
  .object({
    projectId: z.string().uuid(),
    kind: z.enum(KINDS as [MediaKind, ...MediaKind[]]),
    model: z.string().min(1),
    prompt: z.string().trim().min(1, "Write a prompt").max(2000),
    aspectRatio: z.string().optional(),
    duration: z.number().int().optional(),
    startFrameAssetId: z.string().uuid().nullable().optional(),
  })
  .strict();
export const generationIdInput = z.object({ id: z.string().uuid() }).strict();

export class GenerationError extends Error {}

export interface Generation {
  id: string;
  kind: MediaKind;
  model: string;
  prompt: string;
  params: GenerationParams;
  referenceAssetId: string | null;
  status: "queued" | "running" | "succeeded" | "failed" | "canceled";
  error: string | null;
  outputAssetId: string | null;
  createdAt: string;
  completedAt: string | null;
}

/** Whether the Gateway holds a Replicate key for this app. */
export async function generationEnabled(): Promise<boolean> {
  try {
    const status = await integrationStatus({ env, provider: "replicate" });
    return status.configured;
  } catch {
    return false;
  }
}

function replicate() {
  return integrationFetch({ env, provider: "replicate" });
}

export async function listGenerations(
  userId: string,
  projectId: string,
): Promise<Generation[]> {
  const rows = await db
    .select()
    .from(generations)
    .where(and(eq(generations.ownerId, userId), eq(generations.projectId, projectId)))
    .orderBy(desc(generations.createdAt), desc(generations.id));
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    model: row.model,
    prompt: row.prompt,
    params: JSON.parse(row.paramsJson) as GenerationParams,
    referenceAssetId: row.referenceAssetId,
    status: row.status,
    error: row.error,
    outputAssetId: row.outputAssetId,
    createdAt: row.createdAt,
    completedAt: row.completedAt,
  }));
}

async function inFlightCount(userId: string) {
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(generations)
    .where(and(eq(generations.ownerId, userId), inArray(generations.status, IN_FLIGHT)));
  return row?.n ?? 0;
}

export async function startGeneration(
  userId: string,
  input: z.infer<typeof startGenerationInput>,
) {
  const project = await getProject(userId, input.projectId);
  if (!project) throw new GenerationError("Project not found.");
  const model = modelById(input.model);
  if (!model || model.kind !== input.kind) {
    throw new GenerationError("Pick a model from the list.");
  }
  const params: GenerationParams = {};
  if (model.aspectRatios) {
    const ratio = input.aspectRatio ?? model.aspectRatios[0]!;
    if (!model.aspectRatios.includes(ratio)) {
      throw new GenerationError("Pick an aspect ratio from the list.");
    }
    params.aspectRatio = ratio;
  }
  if (model.durations) {
    const duration = input.duration ?? model.durations[0]!;
    if (!model.durations.includes(duration)) {
      throw new GenerationError("Pick a duration from the list.");
    }
    params.duration = duration;
  }
  let startFrame: { id: string; dataUrl: string } | null = null;
  if (input.startFrameAssetId) {
    if (!model.startFrameField) {
      throw new GenerationError(`${model.label} doesn't take a starting frame.`);
    }
    const asset = await getOwnedAsset(userId, input.startFrameAssetId);
    if (!asset || asset.projectId !== project.id || asset.kind !== "image") {
      throw new GenerationError("Pick a starting frame from this project's images.");
    }
    if (asset.size > MAX_START_FRAME_BYTES) {
      throw new GenerationError("The starting frame must be 10 MB or smaller.");
    }
    const object = await env.files.get(asset.r2Key);
    if (!object) throw new GenerationError("The starting frame's file is missing.");
    const bytes = new Uint8Array(await object.arrayBuffer());
    startFrame = { id: asset.id, dataUrl: `data:${asset.mime};base64,${toBase64(bytes)}` };
  }
  if (!(await generationEnabled())) {
    throw new GenerationError("Generation isn't set up yet.");
  }
  if ((await inFlightCount(userId)) >= MAX_IN_FLIGHT) {
    throw new GenerationError(
      `You already have ${MAX_IN_FLIGHT} generations in progress. Cancel one or wait for one to finish.`,
    );
  }

  const id = crypto.randomUUID();
  await db.insert(generations).values({
    id,
    ownerId: userId,
    projectId: project.id,
    kind: model.kind,
    model: model.id,
    prompt: input.prompt,
    paramsJson: JSON.stringify(params),
    referenceAssetId: startFrame?.id ?? null,
    status: "queued",
  });
  await touchProject(userId, project.id);

  const body: Record<string, unknown> = { ...model.extra, [model.promptField]: input.prompt };
  if (params.aspectRatio) body.aspect_ratio = params.aspectRatio;
  if (params.duration) body.duration = params.duration;
  if (startFrame && model.startFrameField) body[model.startFrameField] = startFrame.dataUrl;

  try {
    const res = await replicate()(`${REPLICATE}/v1/models/${model.id}/predictions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ input: body }),
    });
    if (!res.ok) {
      await markFailed(userId, id, await describeFailure(res));
    } else {
      const prediction = (await res.json()) as Prediction;
      await db
        .update(generations)
        .set({ providerId: prediction.id })
        .where(and(eq(generations.id, id), eq(generations.ownerId, userId)));
      await applyPrediction(userId, { id, projectId: project.id, kind: model.kind, prompt: input.prompt }, prediction);
    }
  } catch (error) {
    await markFailed(userId, id, error instanceof Error ? error.message : "The provider couldn't be reached.");
  }
  return { id };
}

interface Prediction {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled" | "aborted";
  output?: unknown;
  error?: unknown;
}

async function describeFailure(res: Response): Promise<string> {
  const refusal = await gatewayRefusal(res.clone());
  if (refusal) return refusal.setup ?? refusal.message;
  const body = (await res.json().catch(() => null)) as { detail?: string; title?: string } | null;
  return body?.detail ?? body?.title ?? `The provider answered ${res.status}.`;
}

async function markFailed(userId: string, id: string, error: string) {
  await db
    .update(generations)
    .set({ status: "failed", error: error.slice(0, 1000), completedAt: new Date().toISOString() })
    .where(and(eq(generations.id, id), eq(generations.ownerId, userId), inArray(generations.status, IN_FLIGHT)));
}

type InFlight = { id: string; projectId: string; kind: MediaKind; prompt: string };

async function applyPrediction(userId: string, gen: InFlight, prediction: Prediction) {
  const where = and(
    eq(generations.id, gen.id),
    eq(generations.ownerId, userId),
    inArray(generations.status, IN_FLIGHT),
  );
  switch (prediction.status) {
    case "starting":
      return;
    case "processing":
      await db.update(generations).set({ status: "running" }).where(where);
      return;
    case "failed":
      await markFailed(userId, gen.id, typeof prediction.error === "string" && prediction.error ? prediction.error : "The model failed without saying why.");
      return;
    case "canceled":
    case "aborted":
      await db.update(generations).set({ status: "canceled", completedAt: new Date().toISOString() }).where(where);
      return;
    case "succeeded":
      await saveOutput(userId, gen, prediction);
      return;
  }
}

const DEFAULT_TYPE: Record<MediaKind, [string, string]> = {
  image: ["image/png", "png"],
  video: ["video/mp4", "mp4"],
  audio: ["audio/mpeg", "mp3"],
};
const EXTENSIONS: Record<string, string> = {
  "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif",
  "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov",
  "audio/mpeg": "mp3", "audio/wav": "wav", "audio/x-wav": "wav", "audio/wave": "wav",
  "audio/ogg": "ogg", "audio/mp4": "m4a", "audio/aac": "aac", "audio/flac": "flac", "audio/webm": "weba",
};

async function saveOutput(userId: string, gen: InFlight, prediction: Prediction) {
  const output = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
  if (typeof output !== "string") {
    await markFailed(userId, gen.id, "The model returned no file.");
    return;
  }
  const file = await downloadOutput(output);
  if (file === "unusable") {
    await markFailed(userId, gen.id, "The model returned an unusable file address.");
    return;
  }
  if (!file) return; // Try again on the next refresh.
  const reported = file.type.split(";")[0]!.trim().toLowerCase();
  const [mime, ext] = ACCEPTED_TYPES[reported] === gen.kind ? [reported, EXTENSIONS[reported]!] : DEFAULT_TYPE[gen.kind];
  const bytes = file.bytes;
  const key = `${gen.projectId}/${gen.id}`;
  await env.files.put(key, bytes, { httpMetadata: { contentType: mime } });
  const name = `${slug(gen.prompt)}.${ext}`;
  await db.batch([
    db
      .insert(assets)
      .values({
        id: gen.id,
        ownerId: userId,
        projectId: gen.projectId,
        kind: gen.kind,
        name,
        mime,
        size: bytes.byteLength,
        r2Key: key,
        source: "generation",
        generationId: gen.id,
      })
      .onConflictDoNothing(),
    db
      .update(generations)
      .set({ status: "succeeded", outputAssetId: gen.id, error: null, completedAt: new Date().toISOString() })
      .where(and(eq(generations.id, gen.id), eq(generations.ownerId, userId), inArray(generations.status, IN_FLIGHT))),
  ]);
}

/** An output file: a public https address the provider hosts, or a data URL. */
async function downloadOutput(output: string): Promise<{ type: string; bytes: ArrayBuffer } | "unusable" | null> {
  if (output.startsWith("data:")) {
    const match = output.match(/^data:([^;,]*)(;base64)?,(.*)$/s);
    if (!match) return "unusable";
    const raw = match[2] ? Uint8Array.from(atob(match[3]!), (c) => c.charCodeAt(0)) : new TextEncoder().encode(decodeURIComponent(match[3]!));
    return { type: match[1] ?? "", bytes: raw.buffer as ArrayBuffer };
  }
  let url: URL;
  try {
    url = new URL(output);
  } catch {
    return "unusable";
  }
  if (url.protocol !== "https:") return "unusable";
  const res = await fetch(url.toString());
  if (!res.ok) return null;
  return { type: res.headers.get("content-type") ?? "", bytes: await res.arrayBuffer() };
}

/** Reads the provider's state for this project's generations in flight and records it. */
export async function syncProject(userId: string, projectId: string) {
  const pending = await db
    .select({ id: generations.id, projectId: generations.projectId, kind: generations.kind, prompt: generations.prompt, providerId: generations.providerId })
    .from(generations)
    .where(
      and(
        eq(generations.ownerId, userId),
        eq(generations.projectId, projectId),
        inArray(generations.status, IN_FLIGHT),
        isNotNull(generations.providerId),
      ),
    );
  if (pending.length === 0) return;
  const call = replicate();
  await Promise.all(
    pending.map(async (gen) => {
      try {
        const res = await call(`${REPLICATE}/v1/predictions/${encodeURIComponent(gen.providerId!)}`);
        if (!res.ok) return;
        await applyPrediction(userId, gen, (await res.json()) as Prediction);
      } catch {
        // Left as it is; the next refresh asks again.
      }
    }),
  );
}

async function ownedGeneration(userId: string, id: string) {
  const [gen] = await db
    .select()
    .from(generations)
    .where(and(eq(generations.id, id), eq(generations.ownerId, userId)));
  return gen ?? null;
}

async function cancelAtProvider(providerId: string | null) {
  if (!providerId) return;
  try {
    await replicate()(`${REPLICATE}/v1/predictions/${encodeURIComponent(providerId)}/cancel`, { method: "POST" });
  } catch {
    // The record is canceled either way.
  }
}

export async function cancelGeneration(userId: string, id: string) {
  const gen = await ownedGeneration(userId, id);
  if (!gen) return false;
  if (gen.status !== "queued" && gen.status !== "running") {
    throw new GenerationError("Only a generation in progress can be canceled.");
  }
  await cancelAtProvider(gen.providerId);
  await db
    .update(generations)
    .set({ status: "canceled", completedAt: new Date().toISOString() })
    .where(and(eq(generations.id, id), eq(generations.ownerId, userId), inArray(generations.status, IN_FLIGHT)));
  return true;
}

export async function retryGeneration(userId: string, id: string) {
  const gen = await ownedGeneration(userId, id);
  if (!gen) throw new GenerationError("Generation not found.");
  if (gen.status !== "failed") throw new GenerationError("Only a failed generation can be retried.");
  const params = JSON.parse(gen.paramsJson) as GenerationParams;
  const reference = gen.referenceAssetId ? await getOwnedAsset(userId, gen.referenceAssetId) : null;
  return startGeneration(userId, {
    projectId: gen.projectId,
    kind: gen.kind,
    model: gen.model,
    prompt: gen.prompt,
    aspectRatio: params.aspectRatio,
    duration: params.duration,
    startFrameAssetId: reference?.id ?? null,
  });
}

export async function deleteGeneration(userId: string, id: string) {
  const gen = await ownedGeneration(userId, id);
  if (!gen) return false;
  if (gen.status === "queued" || gen.status === "running") await cancelAtProvider(gen.providerId);
  await db.batch([
    db
      .update(assets)
      .set({ generationId: null })
      .where(and(eq(assets.generationId, id), eq(assets.ownerId, userId))),
    db.delete(generations).where(and(eq(generations.id, id), eq(generations.ownerId, userId))),
  ]);
  return true;
}

function slug(prompt: string) {
  const words = prompt.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ").slice(0, 6).join("-");
  return words || "generation";
}

function toBase64(bytes: Uint8Array) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/** Stops the provider's work for a project about to be deleted. */
export async function cancelProjectInFlight(userId: string, projectId: string) {
  const pending = await db
    .select({ providerId: generations.providerId })
    .from(generations)
    .where(
      and(
        eq(generations.ownerId, userId),
        eq(generations.projectId, projectId),
        inArray(generations.status, IN_FLIGHT),
      ),
    );
  await Promise.all(pending.map((g) => cancelAtProvider(g.providerId)));
}
