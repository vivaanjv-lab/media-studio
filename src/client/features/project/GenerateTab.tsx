import { useNavigate, useRouter, useSearch } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { useState } from "react";
import { SegmentedToggle } from "@/client/components/SegmentedToggle";
import { Alert, AlertDescription, AlertTitle } from "@/client/components/ui/alert";
import { Button } from "@/client/components/ui/button";
import { Label } from "@/client/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/client/components/ui/select";
import { Textarea } from "@/client/components/ui/textarea";
import { errorMessage } from "@/client/lib/errors";
import {
  KINDS,
  KIND_LABELS,
  modelById,
  modelsFor,
  type MediaKind,
} from "@/shared/models";
import { startGeneration } from "@/serverFunctions/generations";
import type { ProjectData } from "./types";

const NO_FRAME = "none";

export function GenerateTab({ data }: { data: ProjectData }) {
  const { reuse } = useSearch({ from: "/projects/$projectId" });
  const source = reuse ? data.generations.find((g) => g.id === reuse) : undefined;
  // A new form for each generation reused, so its settings fill it.
  return <GenerateForm key={source?.id ?? "new"} data={data} source={source} />;
}

function GenerateForm({
  data,
  source,
}: {
  data: ProjectData;
  source?: ProjectData["generations"][number];
}) {
  const router = useRouter();
  const navigate = useNavigate({ from: "/projects/$projectId" });
  const images = data.assets.filter((a) => a.kind === "image");
  const sourceModel = source ? modelById(source.model) : undefined;

  const [kind, setKind] = useState<MediaKind>(sourceModel?.kind ?? "image");
  const [modelId, setModelId] = useState(sourceModel?.id ?? modelsFor("image")[0]!.id);
  const [prompt, setPrompt] = useState(source?.prompt ?? "");
  const [aspectRatio, setAspectRatio] = useState<string | undefined>(source?.params.aspectRatio);
  const [duration, setDuration] = useState<number | undefined>(source?.params.duration);
  const [frame, setFrame] = useState<string>(
    source?.referenceAssetId && images.some((i) => i.id === source.referenceAssetId)
      ? source.referenceAssetId
      : NO_FRAME,
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const model = modelById(modelId)!;
  const ratio = aspectRatio && model.aspectRatios?.includes(aspectRatio) ? aspectRatio : model.aspectRatios?.[0];
  const seconds = duration && model.durations?.includes(duration) ? duration : model.durations?.[0];
  const off = !data.generationEnabled;

  function pickKind(next: MediaKind) {
    setKind(next);
    setModelId(modelsFor(next)[0]!.id);
  }

  async function submit() {
    if (!prompt.trim()) {
      setError("Write a prompt");
      return;
    }
    setPending(true);
    setError(null);
    try {
      await startGeneration({
        data: {
          projectId: data.project.id,
          kind,
          model: model.id,
          prompt: prompt.trim(),
          aspectRatio: ratio,
          duration: seconds,
          startFrameAssetId: model.startFrameField && frame !== NO_FRAME ? frame : null,
        },
      });
      await navigate({ search: (prev) => ({ ...prev, tab: "history", reuse: undefined }) });
      await router.invalidate();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="space-y-5">
      {off ? (
        <Alert data-testid="generation-off">
          <AlertTitle>Generation is off</AlertTitle>
          <AlertDescription>
            An admin turns it on by adding a Replicate API token to your Gateway:{" "}
            <code>everyapp provider add replicate</code>
          </AlertDescription>
        </Alert>
      ) : null}
      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <SegmentedToggle
          showLabels
          items={KINDS.map((k) => ({ value: k, label: KIND_LABELS[k], testId: `kind-${k}` }))}
          value={kind}
          onChange={pickKind}
        />

        <div className="space-y-2">
          <Label htmlFor="prompt">Prompt</Label>
          <Textarea
            id="prompt"
            rows={4}
            maxLength={2000}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder={kind === "audio" ? "Calm piano over light rain" : "A lighthouse on a cliff in thick fog"}
            data-testid="prompt-input"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Choice
            label="Model"
            testId="model-select"
            value={model.id}
            items={modelsFor(kind).map((m) => ({ value: m.id, label: m.label }))}
            onChange={setModelId}
          />
          {model.aspectRatios ? (
            <Choice
              label="Aspect ratio"
              testId="aspect-select"
              value={ratio!}
              items={model.aspectRatios.map((r) => ({ value: r, label: r }))}
              onChange={setAspectRatio}
            />
          ) : null}
          {model.durations ? (
            <Choice
              label="Duration"
              testId="duration-select"
              value={String(seconds)}
              items={model.durations.map((d) => ({ value: String(d), label: `${d} seconds` }))}
              onChange={(v) => setDuration(Number(v))}
            />
          ) : null}
          {model.startFrameField ? (
            <Choice
              label="Starting frame"
              testId="start-frame-select"
              value={frame}
              items={[
                { value: NO_FRAME, label: "None" },
                ...images.map((i) => ({ value: i.id, label: i.name })),
              ]}
              onChange={setFrame}
            />
          ) : null}
        </div>

        {error ? (
          <Alert variant="destructive" data-testid="generate-error">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <Button type="submit" pending={pending} disabled={off} data-testid="generate-submit">
          <Sparkles aria-hidden />
          Generate
        </Button>
      </form>
    </section>
  );
}

function Choice({
  label,
  testId,
  value,
  items,
  onChange,
}: {
  label: string;
  testId: string;
  value: string;
  items: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="min-w-0 space-y-2">
      <Label>{label}</Label>
      <Select
        items={items}
        value={value}
        onValueChange={(next) => {
          if (next !== null) onChange(next);
        }}
      >
        <SelectTrigger className="w-full" aria-label={label} data-testid={testId}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
