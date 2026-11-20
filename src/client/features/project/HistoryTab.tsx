import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { Ban, History, RotateCcw, SlidersHorizontal, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/client/components/ConfirmDialog";
import { EmptyState } from "@/client/components/EmptyState";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import {
  Table,
  TableBody,
  TableCard,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/client/components/ui/table";
import { errorMessage, formatTime } from "@/client/lib/errors";
import { KIND_LABELS, modelById } from "@/shared/models";
import {
  cancelGeneration,
  deleteGeneration,
  retryGeneration,
} from "@/serverFunctions/generations";
import type { GenerationRow, ProjectData } from "./types";

const STATUS: Record<GenerationRow["status"], { label: string; variant: "secondary" | "info" | "success" | "destructive" | "outline" }> = {
  queued: { label: "Queued", variant: "secondary" },
  running: { label: "Running", variant: "info" },
  succeeded: { label: "Done", variant: "success" },
  failed: { label: "Failed", variant: "destructive" },
  canceled: { label: "Canceled", variant: "outline" },
};

export function HistoryTab({ data }: { data: ProjectData }) {
  const router = useRouter();
  const navigate = useNavigate({ from: "/projects/$projectId" });
  const [busy, setBusy] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<GenerationRow | null>(null);

  async function act(id: string, work: () => Promise<unknown>) {
    setBusy(id);
    try {
      await work();
      await router.invalidate();
    } catch (cause) {
      toast.error(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  }

  if (data.generations.length === 0) {
    return (
      <EmptyState
        icon={History}
        title="No generations yet"
        action={
          <Button onClick={() => void navigate({ search: (prev) => ({ ...prev, tab: "generate" }) })}>
            Generate
          </Button>
        }
      />
    );
  }

  return (
    <>
      <TableCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Status</TableHead>
              <TableHead>Prompt</TableHead>
              <TableHead>Model</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.generations.map((g) => {
              const status = STATUS[g.status];
              const inFlight = g.status === "queued" || g.status === "running";
              return (
                <TableRow key={g.id} data-testid="generation-row" data-status={g.status}>
                  <TableCell className="align-top">
                    <Badge variant={status.variant} data-testid="generation-status">
                      {status.label}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-72 align-top whitespace-normal">
                    <p className="line-clamp-2">{g.prompt}</p>
                    {g.error ? (
                      <p className="mt-1 text-xs text-destructive" data-testid="generation-error">
                        {g.error}
                      </p>
                    ) : null}
                    {g.outputAssetId ? (
                      <Link
                        to="/projects/$projectId"
                        params={{ projectId: data.project.id }}
                        search={(prev) => ({ ...prev, tab: "library", kind: "all", asset: g.outputAssetId! })}
                        className="mt-1 inline-block text-xs text-primary hover:underline"
                        data-testid="generation-output"
                      >
                        Open output
                      </Link>
                    ) : null}
                  </TableCell>
                  <TableCell className="align-top">
                    <p>{modelById(g.model)?.label ?? g.model}</p>
                    <p className="text-xs text-muted-foreground">
                      {[KIND_LABELS[g.kind], g.params.aspectRatio, g.params.duration ? `${g.params.duration}s` : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </TableCell>
                  <TableCell className="align-top text-muted-foreground" suppressHydrationWarning>
                    {formatTime(g.createdAt)}
                  </TableCell>
                  <TableCell className="align-top">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title="Reuse settings"
                        aria-label="Reuse settings"
                        data-testid="generation-reuse"
                        onClick={() => void navigate({ search: (prev) => ({ ...prev, tab: "generate", reuse: g.id }) })}
                      >
                        <SlidersHorizontal aria-hidden />
                      </Button>
                      {g.status === "failed" ? (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title="Retry"
                          aria-label="Retry"
                          data-testid="generation-retry"
                          pending={busy === g.id}
                          onClick={() => void act(g.id, () => retryGeneration({ data: { id: g.id } }))}
                        >
                          <RotateCcw aria-hidden />
                        </Button>
                      ) : null}
                      {inFlight ? (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title="Cancel"
                          aria-label="Cancel"
                          data-testid="generation-cancel"
                          pending={busy === g.id}
                          onClick={() => void act(g.id, () => cancelGeneration({ data: { id: g.id } }))}
                        >
                          <Ban aria-hidden />
                        </Button>
                      ) : null}
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title="Delete"
                        aria-label="Delete"
                        data-testid="generation-delete"
                        onClick={() => setDeleting(g)}
                      >
                        <Trash2 aria-hidden />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableCard>
      {deleting ? (
        <ConfirmDialog
          title="Delete this record?"
          confirmLabel="Delete record"
          destructive
          pending={busy === deleting.id}
          onClose={() => setDeleting(null)}
          onConfirm={() =>
            void act(deleting.id, () => deleteGeneration({ data: { id: deleting.id } })).then(() => setDeleting(null))
          }
        >
          {deleting.status === "queued" || deleting.status === "running"
            ? "The generation is canceled first."
            : deleting.outputAssetId
              ? "Its output stays in the library."
              : null}
        </ConfirmDialog>
      ) : null}
    </>
  );
}
