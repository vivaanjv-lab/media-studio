import { defineEveryApp } from "@every-app/sdk";

export default defineEveryApp({
  id: "media-studio",
  name: "Media Studio",
  description:
    "Generate images, video and audio from prompts and keep them with your uploads in private projects.",
  icon: "/icon.svg",
  access: "everyone",
  resources: {
    d1: ["DB"],
    r2: ["files"],
  },
  capabilities: {
    replicate: {
      access: "read",
      why: "Runs the image, video and audio models. Usage is billed to your Replicate account.",
      docs: "https://replicate.com/account/api-tokens",
    },
  },
  features: {
    generation: {
      name: "Generation",
      why: "Makes images, video and audio from prompts.",
      capabilities: ["replicate"],
    },
  },
});
