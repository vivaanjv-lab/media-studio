import { createServerFn } from "@tanstack/react-start";
import { ensureUserMiddleware } from "@every-app/sdk/tanstack-start";
import * as generations from "@/server/generations";

export const startGeneration = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => generations.startGenerationInput.parse(data))
  .handler(({ data, context: { user } }) => generations.startGeneration(user.id, data));

export const cancelGeneration = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => generations.generationIdInput.parse(data))
  .handler(async ({ data, context: { user } }) => {
    if (!(await generations.cancelGeneration(user.id, data.id))) {
      throw new Error("Generation not found.");
    }
    return { ok: true };
  });

export const retryGeneration = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => generations.generationIdInput.parse(data))
  .handler(({ data, context: { user } }) => generations.retryGeneration(user.id, data.id));

export const deleteGeneration = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => generations.generationIdInput.parse(data))
  .handler(async ({ data, context: { user } }) => {
    if (!(await generations.deleteGeneration(user.id, data.id))) {
      throw new Error("Generation not found.");
    }
    return { ok: true };
  });
