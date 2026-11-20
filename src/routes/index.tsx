import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { FolderPlus, Plus } from "lucide-react";
import { useState } from "react";
import { AppShell } from "@/client/components/AppShell";
import { EmptyState } from "@/client/components/EmptyState";
import { PageHeader } from "@/client/components/PageHeader";
import { ProjectNameDialog } from "@/client/components/ProjectNameDialog";
import { Button } from "@/client/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/client/components/ui/card";
import { formatTime } from "@/client/lib/errors";
import { createProject, getProjects } from "@/serverFunctions/projects";

export const Route = createFileRoute("/")({
  loader: () => getProjects(),
  head: () => ({ meta: [{ title: "Projects · Media Studio" }] }),
  component: ProjectsPage,
});

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

function ProjectsPage() {
  const projects = Route.useLoaderData();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);

  const newButton = (
    <Button onClick={() => setCreating(true)} data-testid="new-project">
      <Plus aria-hidden />
      New project
    </Button>
  );

  return (
    <AppShell>
      <PageHeader title="Projects" actions={projects.length ? newButton : null} />
      {projects.length === 0 ? (
        <EmptyState
          icon={FolderPlus}
          title="No projects yet"
          description="Create one to upload and generate images, video and audio."
          action={newButton}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {projects.map((project) => (
            <Link
              key={project.id}
              to="/projects/$projectId"
              params={{ projectId: project.id }}
              data-testid="project-card"
              className="rounded-xl focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <Card className="h-full transition-colors hover:bg-muted/50">
                <CardHeader>
                  <CardTitle className="truncate">{project.name}</CardTitle>
                  <CardDescription>
                    {plural(project.assetCount, "file", "files")} ·{" "}
                    {plural(project.generationCount, "generation", "generations")}
                  </CardDescription>
                  <CardDescription suppressHydrationWarning>
                    Updated {formatTime(project.updatedAt)}
                  </CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      )}
      {creating ? (
        <ProjectNameDialog
          title="New project"
          submitLabel="Create"
          onClose={() => setCreating(false)}
          onSubmit={async (name) => {
            const project = await createProject({ data: { name } });
            await navigate({
              to: "/projects/$projectId",
              params: { projectId: project.id },
            });
          }}
        />
      ) : null}
    </AppShell>
  );
}
