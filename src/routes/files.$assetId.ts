import { createFileRoute } from "@tanstack/react-router";
import { getEveryAppUser } from "@every-app/sdk/server";
import { env } from "cloudflare:workers";
import { getOwnedAsset } from "@/server/assets";

// A library file, for its owner only. Private like every route: the Gateway
// refuses anyone it hasn't signed in, and another member gets a 404.
export const Route = createFileRoute("/files/$assetId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const user = await getEveryAppUser(request, env);
        if (!user) return new Response("Not found", { status: 404 });
        const asset = /^[0-9a-f-]{36}$/.test(params.assetId)
          ? await getOwnedAsset(user.id, params.assetId)
          : null;
        if (!asset) return new Response("Not found", { status: 404 });

        const range = parseRange(request.headers.get("range"), asset.size);
        const object = await env.files.get(
          asset.r2Key,
          range ? { range: { offset: range.start, length: range.end - range.start + 1 } } : {},
        );
        if (!object) return new Response("Not found", { status: 404 });

        const headers = new Headers({
          "content-type": asset.mime,
          "accept-ranges": "bytes",
          "cache-control": "private, max-age=3600",
          "x-content-type-options": "nosniff",
          "content-security-policy": "default-src 'none'; sandbox",
        });
        const download = new URL(request.url).searchParams.get("download") === "1";
        headers.set(
          "content-disposition",
          `${download ? "attachment" : "inline"}; filename="${asset.name.replace(/[^\w.\- ]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(asset.name)}`,
        );
        if (range) {
          headers.set("content-range", `bytes ${range.start}-${range.end}/${asset.size}`);
          headers.set("content-length", String(range.end - range.start + 1));
          return new Response(object.body, { status: 206, headers });
        }
        headers.set("content-length", String(asset.size));
        return new Response(object.body, { headers });
      },
    },
  },
});

function parseRange(header: string | null, size: number) {
  const match = header?.match(/^bytes=(\d*)-(\d*)$/);
  if (!match || (!match[1] && !match[2])) return null;
  let start: number;
  let end: number;
  if (!match[1]) {
    start = Math.max(0, size - Number(match[2]));
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  }
  if (start > end || start >= size) return null;
  return { start, end };
}
