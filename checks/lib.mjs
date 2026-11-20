// Shared by the suites: small real media files and a local fake of the
// Gateway's replicate capability (it answers the way the Gateway would after
// forwarding to the provider). Nothing here is shipped with the app.
import { deflateSync } from "node:zlib";

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** A PNG painted by `paint(x, y) -> [r, g, b]`. */
export function png(width, height, paint) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0;
    for (let x = 0; x < width; x++) {
      const [r, g, b] = paint(x, y);
      const i = y * (width * 3 + 1) + 1 + x * 3;
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));

/** A harbour at dusk: sky gradient, a low sun, layered water. */
export function duskPng(width = 640, height = 360) {
  return png(width, height, (x, y) => {
    const t = y / height;
    const horizon = 0.62 + 0.03 * Math.sin(x / 40);
    const dx = x - width * 0.68, dy = y - height * 0.5;
    const sun = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy) / (height * 0.12));
    if (t < horizon) {
      return [clamp(40 + 200 * t + 255 * sun), clamp(30 + 120 * t * t + 200 * sun), clamp(90 + 60 * (1 - t) + 120 * sun)];
    }
    const wave = 0.5 + 0.5 * Math.sin(x / 9 + y * 0.8);
    return [clamp(30 + 90 * wave * (1 - t)), clamp(40 + 50 * wave), clamp(80 + 70 * (1 - t))];
  });
}

/** A sketch-like frame: pale paper with a dark horizon band. */
export function sketchPng(width = 320, height = 180) {
  return png(width, height, (x, y) => {
    const band = Math.abs(y - height * 0.6 - 10 * Math.sin(x / 25)) < 3;
    const g = band ? 60 : 225 + 20 * Math.sin((x + y) / 30);
    return [clamp(g), clamp(g - 5), clamp(g - 15)];
  });
}

/** One second of a 440 Hz tone as 16-bit mono WAV. */
export function toneWav(seconds = 1, rate = 8000) {
  const n = seconds * rate;
  const data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) data.writeInt16LE(Math.round(8000 * Math.sin((2 * Math.PI * 440 * i) / rate)), i * 2);
  const head = Buffer.alloc(44);
  head.write("RIFF", 0); head.writeUInt32LE(36 + data.length, 4); head.write("WAVE", 8);
  head.write("fmt ", 12); head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(1, 22);
  head.writeUInt32LE(rate, 24); head.writeUInt32LE(rate * 2, 28); head.writeUInt16LE(2, 32); head.writeUInt16LE(16, 34);
  head.write("data", 36); head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
}

export const FAKE_GATEWAY = "fake-gateway";

/**
 * The Gateway's binding with the replicate capability configured. Prompts
 * containing "fail" fail at the provider; "slow" stays in flight until
 * canceled; anything else succeeds on the first status read.
 * `/__config?configured=0|1` turns the capability off and on; `/__calls`
 * lists what reached it.
 */
export function fakeGatewayWorker() {
  const image = duskPng().toString("base64");
  const audio = toneWav().toString("base64");
  const script = `
const IMAGE = ${JSON.stringify(image)};
const AUDIO = ${JSON.stringify(audio)};
const VIDEO = btoa("\\u0000\\u0000\\u0000\\u0018ftypmp42 placeholder clip");
// The provider's file outputs, as data URLs.
const dataUrl = (kind) => kind === "image" ? "data:image/png;base64," + IMAGE : kind === "audio" ? "data:audio/wav;base64," + AUDIO : "data:video/mp4;base64," + VIDEO;
let configured = true;
const calls = [];
const predictions = new Map();
const refuse = () => Response.json({ error: "Service Unavailable", code: "integration_not_configured", message: "Replicate is not set up." }, { status: 503, headers: { "x-everyapp-error": "integration_not_configured" } });
export default { async fetch(request) {
  const url = new URL(request.url);
  if (url.pathname === "/__config") { configured = url.searchParams.get("configured") === "1"; return Response.json({ configured }); }
  if (url.pathname === "/__calls") return Response.json(calls);
  const body = request.method === "GET" ? null : await request.text();
  calls.push({ method: request.method, path: url.pathname, body });
  if (url.pathname === "/api/integrations/replicate") {
    return Response.json({ requested: true, configured, ready: configured });
  }
  const prefix = "/api/integrations/replicate/api.replicate.com";
  if (!url.pathname.startsWith(prefix)) return refuse();
  if (!configured) return refuse();
  const path = url.pathname.slice(prefix.length);
  let m;
  if (request.method === "POST" && (m = path.match(/^\\/v1\\/models\\/([^/]+)\\/([^/]+)\\/predictions$/))) {
    const input = JSON.parse(body).input ?? {};
    const text = String(input.prompt ?? input.text ?? "");
    const model = m[1] + "/" + m[2];
    const kind = /video|kling/.test(model) ? "video" : /lyria|speech|music/.test(model) ? "audio" : "image";
    const id = "p" + (predictions.size + 1) + Math.random().toString(36).slice(2, 8);
    const p = { id, model, kind, input, mode: /fail/i.test(text) ? "fail" : /slow/i.test(text) ? "slow" : "ok", status: "starting" };
    predictions.set(id, p);
    return Response.json({ id, status: "starting", output: null, error: null }, { status: 201 });
  }
  if (request.method === "POST" && (m = path.match(/^\\/v1\\/predictions\\/([^/]+)\\/cancel$/))) {
    const p = predictions.get(m[1]);
    if (!p) return Response.json({ detail: "Not found." }, { status: 404 });
    p.status = "canceled";
    return Response.json({ id: p.id, status: "canceled" });
  }
  if (request.method === "GET" && (m = path.match(/^\\/v1\\/predictions\\/([^/]+)$/))) {
    const p = predictions.get(m[1]);
    if (!p) return Response.json({ detail: "Not found." }, { status: 404 });
    if (p.status !== "canceled") {
      if (p.mode === "slow") p.status = "processing";
      else if (p.mode === "fail") p.status = "failed";
      else p.status = "succeeded";
    }
    const output = p.status === "succeeded" ? [dataUrl(p.kind)] : null;
    const error = p.status === "failed" ? "The model could not follow this prompt." : null;
    return Response.json({ id: p.id, status: p.status, output, error });
  }
  return Response.json({ detail: "Not found." }, { status: 404 });
} };`;
  return {
    config: {
      name: FAKE_GATEWAY,
      compatibilityDate: "2026-06-01",
      manifest: { mainModule: "fake-gateway.mjs", modules: { "fake-gateway.mjs": { type: "esm", contents: script } } },
    },
  };
}

export async function fakeGatewayCalls(runtime) {
  const worker = await runtime.mf.getWorker(FAKE_GATEWAY);
  return (await worker.fetch("http://fake/__calls")).json();
}

export async function setReplicateConfigured(runtime, on) {
  const worker = await runtime.mf.getWorker(FAKE_GATEWAY);
  await worker.fetch(`http://fake/__config?configured=${on ? 1 : 0}`);
}

/** Create a project from the home page; returns its id. */
export async function createProject(page, expect, name) {
  await page.goto("/");
  await page.getByTestId("new-project").click();
  await page.getByTestId("project-name-input").fill(name);
  await Promise.all([
    page.waitForURL(/\/projects\/[^/?]+/),
    page.getByTestId("project-save").click(),
  ]);
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  return new URL(page.url()).pathname.split("/")[2];
}

/** Upload one file into the open project's library; returns the asset's card. */
export async function uploadFile(page, expect, file) {
  const before = await page.getByTestId("asset-card").count();
  await page.getByTestId("upload-input").setInputFiles(file);
  await expect(page.getByTestId("asset-card")).toHaveCount(before + 1, { timeout: 15000 });
  return page.getByTestId("asset-card").filter({ hasText: file.name });
}
