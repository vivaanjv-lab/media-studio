// F001-F004 through the browser, against the released archive, with a local
// fake of the Gateway's replicate capability.
import { startRuntime, expect } from "/home/user/oss-new/control/runtime/index.mjs";
import {
  FAKE_GATEWAY, createProject, fakeGatewayCalls, fakeGatewayWorker,
  setReplicateConfigured, sketchPng, toneWav, uploadFile,
} from "./lib.mjs";

const runtime = await startRuntime({
  bindings: { EVERY_APP_GATEWAY: { type: "worker", worker: FAKE_GATEWAY } },
  workers: [fakeGatewayWorker()],
});
const SLOW = { timeout: 15000 };

async function pick(page, trigger, option) {
  await page.getByTestId(trigger).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}
const rows = (page) => page.getByTestId("generation-row");

try {
  await runtime.assertPrivateAccess(["/"]);
  const page = await (await runtime.context("owner")).newPage();

  // F001: empty state, then a project.
  await page.goto("/");
  await expect(page.getByText("No projects yet")).toBeVisible();
  await runtime.assertBackLink(page);
  const projectId = await createProject(page, expect, "Harbor teaser");

  // F001: rename it.
  await page.getByTestId("project-actions").click();
  await page.getByRole("menuitem", { name: "Rename" }).click();
  await page.getByTestId("project-name-input").fill("Harbor at dusk teaser");
  await page.getByTestId("project-save").click();
  await expect(page.getByRole("heading", { level: 1, name: "Harbor at dusk teaser" })).toBeVisible();

  // F002: upload (type checked), grid with kind and size, filter.
  await page.getByTestId("tab-library").click();
  await expect(page.getByText("No files yet")).toBeVisible();
  const sketch = await uploadFile(page, expect, { name: "pier-sketch.png", mimeType: "image/png", buffer: sketchPng() });
  await expect(sketch.getByTestId("asset-kind")).toHaveText("Image");
  await expect(sketch.getByTestId("asset-size")).toHaveText(/^\d+(\.\d)? (B|KB)$/);
  await uploadFile(page, expect, { name: "foghorn.wav", mimeType: "audio/wav", buffer: toneWav() });
  await page.getByTestId("upload-input").setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("not media") });
  await expect(page.getByTestId("upload-error")).toContainText("notes.txt");
  await expect(page.getByTestId("asset-card")).toHaveCount(2);

  await page.getByTestId("filter-audio").click();
  await expect(page.getByTestId("asset-card")).toHaveCount(1);
  await expect(page.getByTestId("asset-card")).toContainText("foghorn.wav");
  await page.getByTestId("filter-video").click();
  await expect(page.getByTestId("asset-card")).toHaveCount(0);
  await expect(page.getByText("No video files")).toBeVisible();
  await page.getByTestId("filter-all").click();

  // F002: preview, rename, download, delete.
  await page.getByTestId("asset-card").filter({ hasText: "foghorn.wav" }).click();
  const preview = page.getByTestId("asset-preview");
  await expect(preview.locator("audio")).toBeVisible();
  await preview.getByTestId("asset-rename").click();
  await page.getByTestId("asset-name-input").fill("foghorn-take-2.wav");
  await page.getByTestId("asset-name-save").click();
  await expect(page.getByTestId("asset-preview")).toContainText("foghorn-take-2.wav");
  const download = page.getByTestId("asset-preview").getByTestId("asset-download");
  const href = await download.getAttribute("href");
  expect(href).toMatch(/^\/files\/[^/]+\?download=1$/);
  const res = await runtime.fetch(href, { role: "owner" });
  expect(res.status).toBe(200);
  expect(res.headers.get("content-disposition")).toContain("foghorn-take-2.wav");
  expect(res.headers.get("content-type")).toBe("audio/wav");
  expect((await res.arrayBuffer()).byteLength).toBe(toneWav().length);
  await page.getByTestId("asset-preview").getByTestId("asset-delete").click();
  await page.getByRole("button", { name: "Delete file" }).click();
  await expect(page.getByTestId("asset-card")).toHaveCount(1);
  expect((await runtime.fetch(href, { role: "owner" })).status).toBe(404);

  await sketch.click();
  await expect(page.getByTestId("asset-preview").locator("img")).toBeVisible();
  await page.keyboard.press("Escape");

  // F003: not configured -> the form says how to enable it and sends nothing.
  await setReplicateConfigured(runtime, false);
  await page.getByTestId("tab-generate").click();
  await page.reload();
  await expect(page.getByTestId("generation-off")).toBeVisible();
  await expect(page.getByTestId("generation-off")).toContainText("everyapp provider add replicate");
  await expect(page.getByTestId("generate-submit")).toBeDisabled();
  expect((await fakeGatewayCalls(runtime)).filter((c) => c.method === "POST")).toHaveLength(0);
  await setReplicateConfigured(runtime, true);
  await page.reload();
  await expect(page.getByTestId("generation-off")).toHaveCount(0);

  // F003: an image generation succeeds and lands in the library.
  await page.getByTestId("kind-image").click();
  await pick(page, "model-select", "FLUX Schnell");
  await pick(page, "aspect-select", "16:9");
  await page.getByTestId("prompt-input").fill("Fishing boats returning to a stone harbor at dusk, warm low sun, gentle waves");
  await page.getByTestId("generate-submit").click();
  await expect(page.getByTestId("tab-history")).toHaveAttribute("aria-selected", "true");
  await expect(rows(page).first()).toHaveAttribute("data-status", "succeeded", SLOW);
  await expect(rows(page).first()).toContainText("Fishing boats returning");
  await expect(rows(page).first()).toContainText("FLUX Schnell");
  let posts = (await fakeGatewayCalls(runtime)).filter((c) => c.method === "POST" && c.path.includes("/predictions"));
  expect(posts.at(-1).path).toContain("/v1/models/black-forest-labs/flux-schnell/predictions");
  expect(JSON.parse(posts.at(-1).body).input.aspect_ratio).toBe("16:9");

  await rows(page).first().getByTestId("generation-output").click();
  await expect(page.getByTestId("asset-preview")).toBeVisible();
  await expect(page.getByTestId("asset-preview").locator("img")).toBeVisible();
  await expect(page.getByTestId("asset-preview")).toContainText("Fishing boats returning");
  await page.keyboard.press("Escape");
  await page.getByTestId("tab-library").click();
  const generated = page.getByTestId("asset-card").filter({ has: page.getByTestId("asset-generated") });
  await expect(generated).toHaveCount(1);

  // F003: video with a starting frame from the project's images and a duration.
  await page.getByTestId("tab-generate").click();
  await page.getByTestId("kind-video").click();
  await pick(page, "model-select", "Kling 1.6");
  await pick(page, "duration-select", "10 seconds");
  await pick(page, "start-frame-select", "pier-sketch.png");
  await page.getByTestId("prompt-input").fill("Slow push in along the pier as lanterns flicker on");
  await page.getByTestId("generate-submit").click();
  await expect(rows(page).first()).toHaveAttribute("data-status", "running", SLOW);
  posts = (await fakeGatewayCalls(runtime)).filter((c) => c.method === "POST" && c.path.includes("/predictions"));
  const videoInput = JSON.parse(posts.at(-1).body).input;
  expect(posts.at(-1).path).toContain("/v1/models/kwaivgi/kling-v1.6-standard/predictions");
  expect(videoInput.duration).toBe(10);
  expect(String(videoInput.start_image)).toMatch(/^data:image\/png;base64,/);

  // F004: cancel one in flight.
  await rows(page).first().getByTestId("generation-cancel").click();
  await expect(rows(page).first()).toHaveAttribute("data-status", "canceled");
  expect((await fakeGatewayCalls(runtime)).some((c) => c.path.endsWith("/cancel"))).toBe(true);

  // F003: an audio generation that fails shows its error; F004 retry.
  await page.getByTestId("tab-generate").click();
  await page.getByTestId("kind-audio").click();
  await pick(page, "model-select", "Lyria 2");
  await page.getByTestId("prompt-input").fill("Fail: brass band tuning up");
  await page.getByTestId("generate-submit").click();
  await expect(rows(page).first()).toHaveAttribute("data-status", "failed", SLOW);
  await expect(rows(page).first().getByTestId("generation-error")).toContainText("could not follow this prompt");
  const before = await rows(page).count();
  await rows(page).first().getByTestId("generation-retry").click();
  await expect(rows(page)).toHaveCount(before + 1);
  await expect(rows(page).first()).toContainText("brass band tuning up");
  await expect(rows(page).first()).toHaveAttribute("data-status", "failed", SLOW);

  // F004: reuse prefills the form; delete a record.
  const imageRow = rows(page).filter({ hasText: "Fishing boats returning" });
  await imageRow.getByTestId("generation-reuse").click();
  await expect(page.getByTestId("prompt-input")).toHaveValue(/Fishing boats returning/);
  await expect(page.getByTestId("kind-image")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("model-select")).toContainText("FLUX Schnell");
  await expect(page.getByTestId("aspect-select")).toContainText("16:9");
  await page.getByTestId("tab-history").click();
  const count = await rows(page).count();
  await rows(page).filter({ hasText: "brass band" }).first().getByTestId("generation-delete").click();
  await page.getByRole("button", { name: "Delete record" }).click();
  await expect(rows(page)).toHaveCount(count - 1);

  // F003: at most 5 in flight per member.
  await page.getByTestId("tab-generate").click();
  for (let i = 0; i < 5; i++) {
    await page.getByTestId("prompt-input").fill("Slow study of gulls over the breakwater");
    await page.getByTestId("generate-submit").click();
    await expect(page.getByTestId("tab-history")).toHaveAttribute("aria-selected", "true");
    await expect(rows(page).filter({ hasText: "gulls" })).toHaveCount(i + 1);
    await page.getByTestId("tab-generate").click();
  }
  await page.getByTestId("prompt-input").fill("Slow study of gulls over the breakwater");
  await page.getByTestId("generate-submit").click();
  await expect(page.getByTestId("generate-error")).toContainText("5");
  await page.getByTestId("tab-history").click();
  for (let i = 0; i < 5; i++) {
    const inflight = rows(page).filter({ hasText: "gulls" }).locator("[data-testid=generation-cancel]").first();
    await inflight.click();
    await expect(rows(page).filter({ hasText: "gulls" }).locator("[data-testid=generation-cancel]")).toHaveCount(4 - i);
  }

  // F001: delete a project, its files go with it.
  const scratchId = await createProject(page, expect, "Scratch reel");
  await page.getByTestId("tab-library").click();
  const scratchCard = await uploadFile(page, expect, { name: "test-frame.png", mimeType: "image/png", buffer: sketchPng(64, 36) });
  const scratchAsset = await scratchCard.getAttribute("data-asset-id");
  expect((await runtime.fetch(`/files/${scratchAsset}`, { role: "owner" })).status).toBe(200);
  await page.getByTestId("project-actions").click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await Promise.all([page.waitForURL((u) => u.pathname === "/"), page.getByRole("button", { name: "Delete project" }).click()]);
  await expect(page.getByTestId("project-card")).toHaveCount(1);
  expect((await runtime.fetch(`/files/${scratchAsset}`, { role: "owner" })).status).toBe(404);
  const db = await runtime.database();
  expect((await db.prepare("select count(*) as n from assets where project_id = ?").bind(scratchId).first()).n).toBe(0);
  const r2 = await runtime.mf.getR2Bucket("files");
  expect((await r2.list({ prefix: `${scratchId}/` })).objects).toHaveLength(0);

  // The result on screen: the project's library with the generated still.
  await page.getByTestId("project-card").filter({ hasText: "Harbor at dusk teaser" }).click();
  await page.waitForURL(new RegExp(`/projects/${projectId}`));
  await page.getByTestId("tab-library").click();
  await expect(generated.locator("img")).toBeVisible();
  await expect.poll(() => generated.locator("img").evaluate((img) => img.naturalWidth)).toBeGreaterThan(0);
  await runtime.screenshot(page);

  // Phone-sized smoke.
  const phone = await (await runtime.context("owner", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  await phone.goto("/");
  await expect(phone.getByTestId("project-card")).toContainText("Harbor at dusk teaser");
  await phone.getByTestId("project-card").click();
  await phone.getByTestId("tab-library").click();
  await expect(phone.getByTestId("asset-card").first()).toBeVisible();
  const overflow = await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  console.log("behavior: ok");
} finally {
  await runtime.close();
}
