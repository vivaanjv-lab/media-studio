import { createServerFn } from "@tanstack/react-start";
import { ensureUserMiddleware } from "@every-app/sdk/tanstack-start";
import { z } from "zod";
import * as assets from "@/server/assets";

export const uploadAsset = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => {
    if (!(data instanceof FormData)) throw new Error("Choose a file to upload.");
    const projectId = z.string().uuid().parse(data.get("projectId"));
    const file = data.get("file");
    if (!(file instanceof File)) throw new Error("Choose a file to upload.");
    return { projectId, file };
  })
  .handler(({ data, context: { user } }) =>
    assets.uploadAsset(user.id, data.projectId, data.file),
  );

export const renameAsset = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => assets.renameAssetInput.parse(data))
  .handler(async ({ data, context: { user } }) => {
    const asset = await assets.renameAsset(user.id, data);
    if (!asset) throw new Error("File not found.");
    return asset;
  });

export const deleteAsset = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => assets.assetIdInput.parse(data))
  .handler(async ({ data, context: { user } }) => {
    if (!(await assets.deleteAsset(user.id, data.id))) throw new Error("File not found.");
    return { ok: true };
  });
