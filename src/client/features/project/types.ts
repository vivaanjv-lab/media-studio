import type { getProjectPage } from "@/serverFunctions/projects";

export type ProjectData = Awaited<ReturnType<typeof getProjectPage>>;
export type AssetRow = ProjectData["assets"][number];
export type GenerationRow = ProjectData["generations"][number];
