// X001 and every feature's ownership rules: the Gateway signs people in, the
// app has no sign-in of its own, and one member never reads or changes
// another's projects, files or generations.
import { startRuntime, expect } from "/home/user/oss-new/control/runtime/index.mjs";
import { createProject, sketchPng, uploadFile } from "./lib.mjs";

const runtime = await startRuntime();
try {
  await runtime.assertPrivateAccess(["/"]);

  const owner = await (await runtime.context("owner")).newPage();
  const projectId = await createProject(owner, expect, "Private storyboard");
  await owner.getByTestId("tab-library").click();
  const card = await uploadFile(owner, expect, { name: "secret-frame.png", mimeType: "image/png", buffer: sketchPng() });
  const assetId = await card.getAttribute("data-asset-id");
  const db = await runtime.database();
  // A generation record of the owner's, written as the app writes one.
  await db.prepare(
    "insert into generations (id, owner_id, project_id, kind, model, prompt, params_json, status, error, created_at) " +
    "select ?, owner_id, id, 'image', 'black-forest-labs/flux-schnell', 'owner only prompt', '{}', 'failed', 'x', '2026-11-01T10:00:00.000Z' from projects where id = ?",
  ).bind("00000000-0000-4000-8000-000000000001", projectId).run();

  // Anonymous and outsider never reach private paths.
  for (const path of [`/projects/${projectId}`, `/files/${assetId}`, `/files/${assetId}?download=1`]) {
    for (const role of [undefined, "outsider"]) {
      const res = await runtime.fetch(path, role ? { role } : {});
      expect([401, 403, 302, 303, 307]).toContain(res.status);
      expect(await res.text()).not.toContain("secret-frame");
    }
  }
  expect((await runtime.fetch(`/files/${assetId}`, { role: "owner" })).status).toBe(200);

  // Another member: no file, no project, nothing in their list.
  expect((await runtime.fetch(`/files/${assetId}`, { role: "member" })).status).toBe(404);
  expect((await runtime.fetch(`/files/${assetId}?download=1`, { role: "member" })).status).toBe(404);
  const memberProject = await runtime.fetch(`/projects/${projectId}`, { role: "member" });
  const memberHtml = await memberProject.text();
  expect(memberHtml).not.toContain("Private storyboard");
  expect(memberHtml).not.toContain("secret-frame");
  expect(memberHtml).not.toContain("owner only prompt");
  const member = await (await runtime.context("member")).newPage();
  await member.goto("/");
  await expect(member.getByText("No projects yet")).toBeVisible();
  await member.goto(`/projects/${projectId}?tab=history`);
  await expect(member.getByText("Project not found")).toBeVisible();
  await expect(member.getByText("owner only prompt")).toHaveCount(0);

  // Replaying the owner's own rename and delete requests as the member
  // changes nothing.
  async function capture(page, action) {
    const [request] = await Promise.all([
      page.waitForRequest((r) => r.method() === "POST" && r.url().includes("/_serverFn/")),
      action(),
    ]);
    return { url: request.url(), headers: await request.allHeaders(), body: request.postData() };
  }
  const memberRequest = async (req) => member.evaluate(async ({ url, headers, body }) => {
    const h = Object.fromEntries(Object.entries(headers).filter(([k]) => !k.startsWith(":") && !["cookie", "host", "content-length", "authorization"].includes(k)));
    const r = await fetch(new URL(url).pathname + new URL(url).search, { method: "POST", headers: h, body });
    return r.status;
  }, req);

  await owner.getByTestId("project-actions").click();
  await owner.getByRole("menuitem", { name: "Rename" }).click();
  await owner.getByTestId("project-name-input").fill("Private storyboard v2");
  const rename = await capture(owner, () => owner.getByTestId("project-save").click());
  await expect(owner.getByRole("heading", { level: 1, name: "Private storyboard v2" })).toBeVisible();
  const forged = { ...rename, body: rename.body.replace("Private storyboard v2", "Taken over") };
  await memberRequest(forged);
  expect((await db.prepare("select name from projects where id = ?").bind(projectId).first()).name).toBe("Private storyboard v2");

  await card.click();
  await owner.getByTestId("asset-preview").getByTestId("asset-delete").click();
  const deleteAsset = await capture(owner, () => owner.getByRole("button", { name: "Delete file" }).click());
  await expect(owner.getByTestId("asset-card")).toHaveCount(0);
  // Re-create a file so the replayed delete has something to hit.
  const again = await uploadFile(owner, expect, { name: "second-frame.png", mimeType: "image/png", buffer: sketchPng(100, 60) });
  const againId = await again.getAttribute("data-asset-id");
  await memberRequest({ ...deleteAsset, body: deleteAsset.body.replace(assetId, againId) });
  expect((await runtime.fetch(`/files/${againId}`, { role: "owner" })).status).toBe(200);
  expect((await db.prepare("select count(*) as n from assets where id = ?").bind(againId).first()).n).toBe(1);

  await owner.getByTestId("project-actions").click();
  await owner.getByRole("menuitem", { name: "Delete" }).click();
  const deleteProject = await capture(owner, () => owner.getByRole("button", { name: "Delete project" }).click());
  await owner.waitForURL((u) => u.pathname === "/");
  const otherId = await createProject(owner, expect, "Second storyboard");
  await memberRequest({ ...deleteProject, body: deleteProject.body.replace(projectId, otherId) });
  expect((await db.prepare("select count(*) as n from projects where id = ?").bind(otherId).first()).n).toBe(1);

  // Generation is off without the capability: nothing is sent.
  await owner.goto(`/projects/${otherId}?tab=generate`);
  await expect(owner.getByTestId("generation-off")).toBeVisible();
  expect(runtime.gatewayCalls ? (await runtime.gatewayCalls()).filter((c) => c.method === "POST") : []).toHaveLength(0);

  // No sign-in page of the app's own.
  for (const path of ["/login", "/signin", "/sign-in", "/signup", "/logout", "/auth/login"]) {
    const res = await runtime.fetch(path, { role: "member" });
    const html = await res.text();
    expect(html).not.toMatch(/type="password"/i);
    expect(res.status).not.toBe(200);
  }
  const home = await (await runtime.fetch("/", { role: "member" })).text();
  expect(home).not.toMatch(/type="password"|Sign in|Log in/i);
  console.log("authorization: ok");
} finally {
  await runtime.close();
}
