import { useNavigate, useRouter, useSearch } from "@tanstack/react-router";
import { FileAudio, FileVideo, ImageIcon, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { EmptyState } from "@/client/components/EmptyState";
import { SegmentedToggle } from "@/client/components/SegmentedToggle";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { Card } from "@/client/components/ui/card";
import { errorMessage } from "@/client/lib/errors";
import {
  ACCEPTED_TYPES,
  KIND_LABELS,
  MAX_UPLOAD_BYTES,
  formatBytes,
  type MediaKind,
} from "@/shared/models";
import { uploadAsset } from "@/serverFunctions/assets";
import { AssetPreviewDialog } from "./AssetPreviewDialog";
import type { AssetRow, ProjectData } from "./types";

const FILTERS = [
  { value: "all", label: "All", testId: "filter-all" },
  { value: "image", label: "Images", testId: "filter-image" },
  { value: "video", label: "Video", testId: "filter-video" },
  { value: "audio", label: "Audio", testId: "filter-audio" },
] as const;

const KIND_ICONS = { image: ImageIcon, video: FileVideo, audio: FileAudio };

export function LibraryTab({ data }: { data: ProjectData }) {
  const router = useRouter();
  const navigate = useNavigate({ from: "/projects/$projectId" });
  const { kind, asset: openId } = useSearch({ from: "/projects/$projectId" });
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const shown = kind === "all" ? data.assets : data.assets.filter((a) => a.kind === kind);
  const open = openId ? data.assets.find((a) => a.id === openId) : undefined;

  async function upload(files: File[]) {
    setUploading(true);
    const failed: string[] = [];
    for (const file of files) {
      if (!ACCEPTED_TYPES[file.type.toLowerCase()]) {
        failed.push(`${file.name} isn't an image, video or audio file.`);
        continue;
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        failed.push(`${file.name} is larger than ${formatBytes(MAX_UPLOAD_BYTES)}.`);
        continue;
      }
      const form = new FormData();
      form.set("projectId", data.project.id);
      form.set("file", file);
      try {
        await uploadAsset({ data: form });
      } catch (cause) {
        failed.push(errorMessage(cause));
      }
    }
    setErrors(failed);
    await router.invalidate();
    setUploading(false);
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedToggle
          showLabels
          items={FILTERS.map((f) => ({ ...f }))}
          value={kind}
          onChange={(value) => void navigate({ search: (prev) => ({ ...prev, kind: value }) })}
        />
        <Button pending={uploading} onClick={() => input.current?.click()}>
          <Upload aria-hidden />
          Upload
        </Button>
        <input
          ref={input}
          type="file"
          multiple
          hidden
          accept={Object.keys(ACCEPTED_TYPES).join(",")}
          data-testid="upload-input"
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            event.target.value = "";
            if (files.length) void upload(files);
          }}
        />
      </div>

      {errors.length ? (
        <Alert variant="destructive" data-testid="upload-error">
          <AlertDescription>
            {errors.map((e) => (
              <p key={e}>{e}</p>
            ))}
          </AlertDescription>
        </Alert>
      ) : null}

      {data.assets.length === 0 ? (
        <EmptyState
          icon={Upload}
          title="No files yet"
          description={`Upload images, video or audio up to ${formatBytes(MAX_UPLOAD_BYTES)}, or generate some.`}
        />
      ) : shown.length === 0 ? (
        <EmptyState
          kind="filtered"
          title={`No ${KIND_LABELS[kind as MediaKind].toLowerCase()} files`}
        />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {shown.map((asset) => (
            <AssetCard
              key={asset.id}
              asset={asset}
              onOpen={() => void navigate({ search: (prev) => ({ ...prev, asset: asset.id }) })}
            />
          ))}
        </div>
      )}

      {open ? (
        <AssetPreviewDialog
          asset={open}
          onClose={() => void navigate({ search: (prev) => ({ ...prev, asset: undefined }) })}
        />
      ) : null}
    </section>
  );
}

function AssetCard({ asset, onOpen }: { asset: AssetRow; onOpen: () => void }) {
  const Icon = KIND_ICONS[asset.kind];
  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid="asset-card"
      data-asset-id={asset.id}
      className="min-w-0 rounded-xl text-left focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <Card size="sm" className="h-full gap-2 pt-0 transition-colors hover:bg-muted/50">
        <div className="flex aspect-video items-center justify-center overflow-hidden bg-muted">
          {asset.kind === "image" ? (
            <img
              src={`/files/${asset.id}`}
              alt={asset.name}
              loading="lazy"
              className="size-full object-cover"
            />
          ) : (
            <Icon className="size-8 text-muted-foreground" aria-hidden />
          )}
        </div>
        <div className="space-y-1.5 px-3">
          <p className="truncate font-medium" title={asset.name}>
            {asset.name}
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary" data-testid="asset-kind">
              {KIND_LABELS[asset.kind]}
            </Badge>
            {asset.source === "generation" ? (
              <Badge variant="soft" data-testid="asset-generated">
                Generated
              </Badge>
            ) : null}
            <span className="text-xs text-muted-foreground" data-testid="asset-size">
              {formatBytes(asset.size)}
            </span>
          </div>
        </div>
      </Card>
    </button>
  );
}
