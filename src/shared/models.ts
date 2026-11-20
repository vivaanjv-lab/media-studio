// The fixed catalogue of models, shared by the form and the server. Each
// entry says which options it takes and how they reach the provider's input.

export type MediaKind = "image" | "video" | "audio";
export const KINDS: MediaKind[] = ["image", "video", "audio"];
export const KIND_LABELS: Record<MediaKind, string> = {
  image: "Image",
  video: "Video",
  audio: "Audio",
};

export interface ModelSpec {
  id: string;
  label: string;
  kind: MediaKind;
  promptField: "prompt" | "text";
  aspectRatios?: string[];
  durations?: number[];
  /** The input field a starting frame goes in, when the model takes one. */
  startFrameField?: string;
  /** Fixed extra input. */
  extra?: Record<string, unknown>;
}

export const MODELS: ModelSpec[] = [
  {
    id: "black-forest-labs/flux-schnell",
    label: "FLUX Schnell",
    kind: "image",
    promptField: "prompt",
    aspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4", "21:9"],
    extra: { output_format: "png" },
  },
  {
    id: "black-forest-labs/flux-1.1-pro",
    label: "FLUX 1.1 Pro",
    kind: "image",
    promptField: "prompt",
    aspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4", "21:9"],
    extra: { output_format: "png" },
  },
  {
    id: "kwaivgi/kling-v1.6-standard",
    label: "Kling 1.6",
    kind: "video",
    promptField: "prompt",
    aspectRatios: ["16:9", "9:16", "1:1"],
    durations: [5, 10],
    startFrameField: "start_image",
  },
  {
    id: "minimax/video-01",
    label: "MiniMax Video-01",
    kind: "video",
    promptField: "prompt",
    startFrameField: "first_frame_image",
  },
  {
    id: "google/lyria-2",
    label: "Lyria 2",
    kind: "audio",
    promptField: "prompt",
  },
  {
    id: "minimax/speech-02-turbo",
    label: "MiniMax Speech",
    kind: "audio",
    promptField: "text",
  },
];

export function modelById(id: string): ModelSpec | undefined {
  return MODELS.find((m) => m.id === id);
}

export function modelsFor(kind: MediaKind): ModelSpec[] {
  return MODELS.filter((m) => m.kind === kind);
}

export interface GenerationParams {
  aspectRatio?: string;
  duration?: number;
}

export const MAX_IN_FLIGHT = 5;
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

/** The types the library accepts, by kind. */
export const ACCEPTED_TYPES: Record<string, MediaKind> = {
  "image/png": "image",
  "image/jpeg": "image",
  "image/webp": "image",
  "image/gif": "image",
  "video/mp4": "video",
  "video/webm": "video",
  "video/quicktime": "video",
  "audio/mpeg": "audio",
  "audio/wav": "audio",
  "audio/x-wav": "audio",
  "audio/wave": "audio",
  "audio/ogg": "audio",
  "audio/mp4": "audio",
  "audio/aac": "audio",
  "audio/flac": "audio",
  "audio/webm": "audio",
};

export function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  return `${(size / 1024 / 1024 / 1024).toFixed(1)} GB`;
}
