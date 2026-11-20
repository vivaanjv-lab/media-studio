// Projects, files and generation records survive a restart.
import { startRuntime, expect } from "/home/user/oss-new/control/runtime/index.mjs";
import { createProject, sketchPng, uploadFile } from "./lib.mjs";

const runtime = await startRuntime();
try {
  const page = await (await runtime.context("owner")).newPage();
  const projectId = await createProject(page, expect, "Lighthouse spot");
  await page.getByTestId("tab-library").click();
  const card = await uploadFile(page, expect, { name: "lamp-room.png", mimeType: "image/png", buffer: sketchPng() });
  const assetId = await card.getAttribute("data-asset-id");

  await runtime.restart();

  const again = await (await runtime.context("owner")).newPage();
  await again.goto("/");
  await expect(again.getByTestId("project-card")).toContainText("Lighthouse spot");
  await again.goto(`/projects/${projectId}?tab=library`);
  await expect(again.getByTestId("asset-card")).toContainText("lamp-room.png");
  const file = await runtime.fetch(`/files/${assetId}`, { role: "owner" });
  expect(file.status).toBe(200);
  expect(Buffer.from(await file.arrayBuffer()).equals(sketchPng())).toBe(true);
  console.log("persistence: ok");
} finally {
  await runtime.close();
}
