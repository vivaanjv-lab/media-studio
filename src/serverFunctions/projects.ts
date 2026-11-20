import { createServerFn } from "@tanstack/react-start";
import { notFound } from "@tanstack/react-router";
import { ensureUserMiddleware } from "@every-app/sdk/tanstack-start";
import { z } from "zod";
import * as projects from "@/server/projects";
import { listAssets } from "@/server/assets";
import {
  cancelProjectInFlight,
  generationEnabled,
  listGenerations,
  syncProject,
} from "@/server/generations";
import { rememberUser } from "@/server/users";

// Every server function runs behind ensureUserMiddleware: `context.user` is
// the person the Gateway signed in, and every query takes their id.
export const getProjects = createServerFn()
  .middleware([ensureUserMiddleware])
  .handler(async ({ context: { user } }) => {
    await rememberUser(user);
    return projects.listProjects(user.id);
  });

export const getProjectPage = createServerFn()
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => z.object({ id: z.string() }).parse(data))
  .handler(async ({ data, context: { user } }) => {
    await rememberUser(user);
    const id = z.string().uuid().safeParse(data.id);
    const project = id.success ? await projects.getProject(user.id, id.data) : null;
    if (!project) throw notFound();
    const enabled = await generationEnabled();
    if (enabled) await syncProject(user.id, project.id);
    const [assets, generations] = await Promise.all([
      listAssets(user.id, project.id),
      listGenerations(user.id, project.id),
    ]);
    return { project, assets, generations, generationEnabled: enabled };
  });

export const createProject = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => projects.createProjectInput.parse(data))
  .handler(async ({ data, context: { user } }) => {
    await rememberUser(user);
    return projects.createProject(user.id, data);
  });

export const renameProject = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => projects.renameProjectInput.parse(data))
  .handler(async ({ data, context: { user } }) => {
    const project = await projects.renameProject(user.id, data);
    if (!project) throw new Error("Project not found.");
    return project;
  });

export const deleteProject = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => projects.projectIdInput.parse(data))
  .handler(async ({ data, context: { user } }) => {
    if (await projects.getProject(user.id, data.id)) {
      await cancelProjectInFlight(user.id, data.id);
    }
    if (!(await projects.deleteProject(user.id, data.id))) {
      throw new Error("Project not found.");
    }
    return { ok: true };
  });
