import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

const createdAt = () =>
  text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`);

// One row per Gateway user (`user.id`), made the first time they use the app.
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  createdAt: createdAt(),
});

export const projects = sqliteTable(
  "projects",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    name: text("name").notNull(),
    createdAt: createdAt(),
    updatedAt: createdAt(),
  },
  (t) => [index("projects_owner_idx").on(t.ownerId, t.createdAt)],
);

export const assets = sqliteTable(
  "assets",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    projectId: text("project_id").notNull(),
    kind: text("kind", { enum: ["image", "video", "audio"] }).notNull(),
    name: text("name").notNull(),
    mime: text("mime").notNull(),
    size: integer("size").notNull(),
    r2Key: text("r2_key").notNull(),
    source: text("source", { enum: ["upload", "generation"] }).notNull(),
    generationId: text("generation_id"),
    createdAt: createdAt(),
  },
  (t) => [index("assets_project_idx").on(t.ownerId, t.projectId)],
);

export const generations = sqliteTable(
  "generations",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    projectId: text("project_id").notNull(),
    kind: text("kind", { enum: ["image", "video", "audio"] }).notNull(),
    model: text("model").notNull(),
    prompt: text("prompt").notNull(),
    paramsJson: text("params_json").notNull().default("{}"),
    referenceAssetId: text("reference_asset_id"),
    status: text("status", {
      enum: ["queued", "running", "succeeded", "failed", "canceled"],
    }).notNull(),
    error: text("error"),
    providerId: text("provider_id"),
    outputAssetId: text("output_asset_id"),
    createdAt: createdAt(),
    completedAt: text("completed_at"),
  },
  (t) => [
    index("generations_project_idx").on(t.ownerId, t.projectId, t.createdAt),
    index("generations_status_idx").on(t.ownerId, t.status),
  ],
);
