import { and, desc, eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { db } from "@/db";
import { assets, generations } from "@/db/schema";
import { ACCEPTED_TYPES, MAX_UPLOAD_BYTES, formatBytes } from "@/shared/models";
import { getProject, touchProject } from "./projects";

export const renameAssetInput = z
  .object({
    id: z.string().uuid(),
    name: z.string().trim().min(1, "Give the file a name").max(200),
  })
  .strict();
export const assetIdInput = z.object({ id: z.string().uuid() }).strict();

export interface Asset {
  id: string;
  projectId: string;
  kind: "image" | "video" | "audio";
  name: string;
  mime: string;
  size: number;
  source: "upload" | "generation";
  generationId: string | null;
  prompt: string | null;
  createdAt: string;
}

const shown = {
  id: assets.id,
  projectId: assets.projectId,
  kind: assets.kind,
  name: assets.name,
  mime: assets.mime,
  size: assets.size,
  source: assets.source,
  generationId: assets.generationId,
  prompt: generations.prompt,
  createdAt: assets.createdAt,
};

export function listAssets(userId: string, projectId: string): Promise<Asset[]> {
  return db
    .select(shown)
    .from(assets)
    .leftJoin(
      generations,
      and(eq(generations.id, assets.generationId), eq(generations.ownerId, userId)),
    )
    .where(and(eq(assets.ownerId, userId), eq(assets.projectId, projectId)))
    .orderBy(desc(assets.createdAt), desc(assets.id));
}

/** The stored file's record when this user owns it, else null. */
export async function getOwnedAsset(userId: string, id: string) {
  const [asset] = await db
    .select()
    .from(assets)
    .where(and(eq(assets.id, id), eq(assets.ownerId, userId)));
  return asset ?? null;
}

export class UploadError extends Error {}

export async function uploadAsset(userId: string, projectId: string, file: File) {
  if (!(await getProject(userId, projectId))) {
    throw new UploadError("Project not found.");
  }
  const mime = file.type.toLowerCase();
  const kind = ACCEPTED_TYPES[mime];
  if (!kind) {
    throw new UploadError(`${file.name} isn't an image, video or audio file.`);
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new UploadError(
      `${file.name} is larger than ${formatBytes(MAX_UPLOAD_BYTES)}.`,
    );
  }
  if (file.size === 0) throw new UploadError(`${file.name} is empty.`);
  const id = crypto.randomUUID();
  const key = `${projectId}/${id}`;
  await env.files.put(key, file, {
    httpMetadata: { contentType: mime },
  });
  const name = file.name.trim().slice(0, 200) || "Untitled";
  await db.insert(assets).values({
    id,
    ownerId: userId,
    projectId,
    kind,
    name,
    mime,
    size: file.size,
    r2Key: key,
    source: "upload",
  });
  await touchProject(userId, projectId);
  return { id, name };
}

export async function renameAsset(
  userId: string,
  { id, name }: z.infer<typeof renameAssetInput>,
) {
  const [asset] = await db
    .update(assets)
    .set({ name })
    .where(and(eq(assets.id, id), eq(assets.ownerId, userId)))
    .returning({ id: assets.id, name: assets.name });
  return asset ?? null;
}

export async function deleteAsset(userId: string, id: string) {
  const asset = await getOwnedAsset(userId, id);
  if (!asset) return false;
  await db.batch([
    db
      .update(generations)
      .set({ outputAssetId: null })
      .where(and(eq(generations.outputAssetId, id), eq(generations.ownerId, userId))),
    db.delete(assets).where(and(eq(assets.id, id), eq(assets.ownerId, userId))),
  ]);
  await env.files.delete(asset.r2Key);
  return true;
}
