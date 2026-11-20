import {
  Link,
  createFileRoute,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { MoreHorizontal } from "lucide-react";
import { useEffect, useState } from "react";
import { z } from "zod";
import { AppShell } from "@/client/components/AppShell";
import { ConfirmDialog } from "@/client/components/ConfirmDialog";
import { NotFound } from "@/client/components/NotFound";
import { PageHeader } from "@/client/components/PageHeader";
import { ProjectNameDialog } from "@/client/components/ProjectNameDialog";
import { Button } from "@/client/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/client/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger } from "@/client/components/ui/tabs";
import { errorMessage } from "@/client/lib/errors";
import { GenerateTab } from "@/client/features/project/GenerateTab";
import { HistoryTab } from "@/client/features/project/HistoryTab";
import { LibraryTab } from "@/client/features/project/LibraryTab";
import { toast } from "sonner";
import {
  deleteProject,
  getProjectPage,
  renameProject,
} from "@/serverFunctions/projects";

const search = z.object({
  tab: z.enum(["library", "generate", "history"]).catch("library").default("library"),
  kind: z.enum(["all", "image", "video", "audio"]).catch("all").default("all"),
  asset: z.string().optional().catch(undefined),
  reuse: z.string().optional().catch(undefined),
});
export type ProjectSearch = z.infer<typeof search>;

export const Route = createFileRoute("/projects/$projectId")({
  validateSearch: search,
  loader: ({ params }) => getProjectPage({ data: { id: params.projectId } }),
  head: ({ loaderData }) => ({
    meta: [{ title: loaderData ? `${loaderData.project.name} · Media Studio` : "Media Studio" }],
  }),
  notFoundComponent: () => <NotFound title="Project not found" />,
  component: ProjectPage,
});

function ProjectPage() {
  const data = Route.useLoaderData();
  const { tab } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const router = useRouter();
  const [dialog, setDialog] = useState<"rename" | "delete" | null>(null);
  const [deleting, setDeleting] = useState(false);
  const { project, assets, generations } = data;

  // While anything is in flight, read its state again every few seconds.
  const inFlight = generations.some((g) => g.status === "queued" || g.status === "running");
  useEffect(() => {
    if (!inFlight) return;
    const timer = setInterval(() => void router.invalidate(), 2500);
    return () => clearInterval(timer);
  }, [inFlight, router]);

  return (
    <AppShell
      nav={
        <Link to="/" className="truncate text-sm text-muted-foreground hover:text-foreground">
          Projects
        </Link>
      }
    >
      <PageHeader
        title={project.name}
        description={`${assets.length} ${assets.length === 1 ? "file" : "files"} · ${generations.length} ${generations.length === 1 ? "generation" : "generations"}`}
        actions={
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="outline" size="icon" aria-label="Project actions" data-testid="project-actions" />
              }
            >
              <MoreHorizontal aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setDialog("rename")}>Rename</DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onClick={() => setDialog("delete")}>
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />

      <Tabs
        value={tab}
        onValueChange={(value) =>
          void navigate({ search: (prev) => ({ ...prev, tab: value as ProjectSearch["tab"], reuse: undefined }) })
        }
      >
        <TabsList>
          <TabsTrigger value="library" data-testid="tab-library">Library</TabsTrigger>
          <TabsTrigger value="generate" data-testid="tab-generate">Generate</TabsTrigger>
          <TabsTrigger value="history" data-testid="tab-history">History</TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === "library" ? <LibraryTab data={data} /> : null}
      {tab === "generate" ? <GenerateTab data={data} /> : null}
      {tab === "history" ? <HistoryTab data={data} /> : null}

      {dialog === "rename" ? (
        <ProjectNameDialog
          title="Rename project"
          submitLabel="Save"
          initialName={project.name}
          onClose={() => setDialog(null)}
          onSubmit={async (name) => {
            await renameProject({ data: { id: project.id, name } });
            await router.invalidate();
            setDialog(null);
          }}
        />
      ) : null}
      {dialog === "delete" ? (
        <ConfirmDialog
          title={`Delete ${project.name}?`}
          confirmLabel="Delete project"
          destructive
          pending={deleting}
          onClose={() => setDialog(null)}
          onConfirm={async () => {
            setDeleting(true);
            try {
              await deleteProject({ data: { id: project.id } });
              await navigate({ to: "/" });
            } catch (cause) {
              toast.error(errorMessage(cause));
              setDeleting(false);
            }
          }}
        >
          Its files and generation history are deleted too.
        </ConfirmDialog>
      ) : null}
    </AppShell>
  );
}
