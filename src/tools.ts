// The app's tools for AI clients, served by the Gateway at /mcp and called
// with the signed-in user. Read-only: they share the pages' queries.
import { ToolError, defineTools } from "@every-app/sdk/server";
import { z } from "zod";
import { listAssets } from "@/server/assets";
import { listGenerations } from "@/server/generations";
import { getProject, listProjects } from "@/server/projects";

export const tools = defineTools(
  {
    list_projects: {
      description: "List the user's projects with how many files and generations each holds.",
      risk: "read",
      input: z.object({}).strict(),
      handler: (_input, { user }) => listProjects(user.id),
    },
    get_project: {
      description: "A project's library files and its generations, newest first.",
      risk: "read",
      input: z.object({ projectId: z.string().uuid() }).strict(),
      handler: async ({ projectId }, { user }) => {
        const project = await getProject(user.id, projectId);
        if (!project) throw new ToolError("No project with that id");
        const [assets, generations] = await Promise.all([
          listAssets(user.id, projectId),
          listGenerations(user.id, projectId),
        ]);
        return { project, assets, generations };
      },
    },
  },
  {
    instructions: "Call list_projects first when a project id isn't already known.",
  },
);
