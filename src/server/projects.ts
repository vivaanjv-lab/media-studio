import { and, desc, eq, sql } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { db } from "@/db";
import { assets, generations, projects } from "@/db/schema";

export const projectNameInput = z
  .string()
  .trim()
  .min(1, "Give the project a name")
  .max(120, "Keep the name under 120 characters");
export const createProjectInput = z.object({ name: projectNameInput }).strict();
export const renameProjectInput = z
  .object({ id: z.string().uuid(), name: projectNameInput })
  .strict();
export const projectIdInput = z.object({ id: z.string().uuid() }).strict();

export interface ProjectSummary {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  assetCount: number;
  generationCount: number;
}

export async function listProjects(userId: string): Promise<ProjectSummary[]> {
  return db
    .select({
      id: projects.id,
      name: projects.name,
      createdAt: projects.createdAt,
      updatedAt: projects.updatedAt,
      assetCount: sql<number>`(select count(*) from ${assets} where ${assets.projectId} = ${projects.id} and ${assets.ownerId} = ${userId})`,
      generationCount: sql<number>`(select count(*) from ${generations} where ${generations.projectId} = ${projects.id} and ${generations.ownerId} = ${userId})`,
    })
    .from(projects)
    .where(eq(projects.ownerId, userId))
    .orderBy(desc(projects.updatedAt), desc(projects.id));
}

/** The project when this user owns it, else null. */
export async function getProject(userId: string, id: string) {
  const [project] = await db
    .select({ id: projects.id, name: projects.name, createdAt: projects.createdAt })
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.ownerId, userId)));
  return project ?? null;
}

export async function createProject(
  userId: string,
  { name }: z.infer<typeof createProjectInput>,
) {
  const [project] = await db
    .insert(projects)
    .values({ id: crypto.randomUUID(), ownerId: userId, name })
    .returning({ id: projects.id, name: projects.name });
  return project!;
}

export async function renameProject(
  userId: string,
  { id, name }: z.infer<typeof renameProjectInput>,
) {
  const [project] = await db
    .update(projects)
    .set({ name, updatedAt: new Date().toISOString() })
    .where(and(eq(projects.id, id), eq(projects.ownerId, userId)))
    .returning({ id: projects.id, name: projects.name });
  return project ?? null;
}

export async function touchProject(userId: string, id: string) {
  await db
    .update(projects)
    .set({ updatedAt: new Date().toISOString() })
    .where(and(eq(projects.id, id), eq(projects.ownerId, userId)));
}

/** Deletes the project, its records and its stored files. False when it isn't this user's. */
export async function deleteProject(userId: string, id: string) {
  const project = await getProject(userId, id);
  if (!project) return false;
  const keys = await db
    .select({ key: assets.r2Key })
    .from(assets)
    .where(and(eq(assets.projectId, id), eq(assets.ownerId, userId)));
  await db.batch([
    db
      .delete(generations)
      .where(and(eq(generations.projectId, id), eq(generations.ownerId, userId))),
    db
      .delete(assets)
      .where(and(eq(assets.projectId, id), eq(assets.ownerId, userId))),
    db
      .delete(projects)
      .where(and(eq(projects.id, id), eq(projects.ownerId, userId))),
  ]);
  const all = keys.map((k) => k.key);
  // Generated outputs that were still being written land under the same prefix.
  let cursor: string | undefined;
  do {
    const listed = await env.files.list({ prefix: `${id}/`, cursor });
    for (const object of listed.objects) all.push(object.key);
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);
  for (let i = 0; i < all.length; i += 1000) {
    await env.files.delete(all.slice(i, i + 1000));
  }
  return true;
}
