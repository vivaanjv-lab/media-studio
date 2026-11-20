import { useRouter } from "@tanstack/react-router";
import { Download, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { ConfirmDialog } from "@/client/components/ConfirmDialog";
import { FormDialog } from "@/client/components/FormDialog";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/client/components/ui/dialog";
import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";
import { errorMessage, formatTime } from "@/client/lib/errors";
import { KIND_LABELS, formatBytes } from "@/shared/models";
import { deleteAsset, renameAsset } from "@/serverFunctions/assets";
import type { AssetRow } from "./types";

export function AssetPreviewDialog({
  asset,
  onClose,
}: {
  asset: AssetRow;
  onClose: () => void;
}) {
  const router = useRouter();
  const [step, setStep] = useState<"view" | "rename" | "delete">("view");
  const [name, setName] = useState(asset.name);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const src = `/files/${asset.id}`;

  async function run(work: () => Promise<unknown>, after: () => void) {
    setPending(true);
    setError(null);
    try {
      await work();
      await router.invalidate();
      after();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPending(false);
    }
  }

  if (step === "rename") {
    return (
      <FormDialog
        title="Rename file"
        onClose={() => setStep("view")}
        actions={
          <>
            <Button variant="outline" onClick={() => setStep("view")} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" form="asset-name-form" pending={pending} data-testid="asset-name-save">
              Save
            </Button>
          </>
        }
      >
        <form
          id="asset-name-form"
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            void run(() => renameAsset({ data: { id: asset.id, name: name.trim() } }), () => setStep("view"));
          }}
        >
          <Label htmlFor="asset-name">Name</Label>
          <Input
            id="asset-name"
            autoFocus
            value={name}
            maxLength={200}
            onChange={(event) => setName(event.target.value)}
            data-testid="asset-name-input"
          />
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
        </form>
      </FormDialog>
    );
  }

  if (step === "delete") {
    return (
      <ConfirmDialog
        title={`Delete ${asset.name}?`}
        confirmLabel="Delete file"
        destructive
        pending={pending}
        onClose={() => setStep("view")}
        onConfirm={() => void run(() => deleteAsset({ data: { id: asset.id } }), onClose)}
      >
        {error ?? "The file can't be recovered."}
      </ConfirmDialog>
    );
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-2xl" data-testid="asset-preview">
        <DialogHeader>
          <DialogTitle className="truncate pr-8">{asset.name}</DialogTitle>
          <DialogDescription render={<div />} className="flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary">{KIND_LABELS[asset.kind]}</Badge>
            {asset.source === "generation" ? <Badge variant="soft">Generated</Badge> : null}
            <span>{formatBytes(asset.size)}</span>
            <span aria-hidden>·</span>
            <span suppressHydrationWarning>{formatTime(asset.createdAt)}</span>
          </DialogDescription>
        </DialogHeader>
        <div className="flex max-h-[60vh] items-center justify-center overflow-hidden rounded-lg bg-muted">
          {asset.kind === "image" ? (
            <img src={src} alt={asset.name} className="max-h-[60vh] w-auto object-contain" />
          ) : asset.kind === "video" ? (
            <video src={src} controls playsInline className="max-h-[60vh] w-full" />
          ) : (
            <audio src={src} controls className="w-full p-4" />
          )}
        </div>
        {asset.prompt ? (
          <p className="text-sm text-muted-foreground" data-testid="asset-prompt">
            {asset.prompt}
          </p>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={() => setStep("rename")} data-testid="asset-rename">
            <Pencil aria-hidden />
            Rename
          </Button>
          <Button
            variant="outline"
            nativeButton={false}
            render={<a href={`${src}?download=1`} download={asset.name} />}
            data-testid="asset-download"
          >
            <Download aria-hidden />
            Download
          </Button>
          <Button variant="destructive" onClick={() => setStep("delete")} data-testid="asset-delete">
            <Trash2 aria-hidden />
            Delete
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
