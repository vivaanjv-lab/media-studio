# Media Studio

Generate images, video and audio from text prompts, and keep them with your own uploads in private projects. Each member's projects, files and generation history are theirs alone.

Inspired by https://runwayml.com

Built with [oss.new](https://oss.new) for [EveryApp](https://github.com/every-app/every-app).

## Features

- Create, rename and delete projects that hold your media work.
- Upload images, video and audio, then preview, filter, rename, download and delete them.
- Generate images, video (optionally from a starting frame) and audio from a prompt with a choice of models and options.
- Follow each generation's status, reuse its settings, retry failures, cancel ones in progress and delete records.

Left out: accounts and sign-in, which your Gateway handles; mobile apps and editor plugins; plans, credits and billing; the editing studio, agents and workflows; upscaling and ad tools; shared team workspaces.

## Setup

```sh
pnpm install
pnpm dev                      # local, behind a dev Gateway
node checks/behavior.mjs      # the checks run against a packaged release
pnpm run deploy               # to your Cloudflare account, behind your Gateway
```

The app needs a D1 database and an R2 bucket, which the deploy creates. It has no secrets or settings of its own.

Generation is optional: it is off until an admin adds a Replicate API token to the Gateway with `everyapp provider add replicate` (tokens: https://replicate.com/account/api-tokens). Model usage is billed to that Replicate account. Locally, put `REPLICATE_API_TOKEN` in `.dev.vars`.

## Limitations

- A generation's status is read from Replicate while its project is open; one started and left alone finishes the next time the project is opened.
- Uploads are capped at 100 MB per file, and a starting frame at 10 MB.
- Model availability and options follow Replicate's catalogue; a model it retires fails with Replicate's error.
- Real generations through Replicate are not part of the local checks, which use a stand-in for the Gateway.
