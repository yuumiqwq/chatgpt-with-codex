import assert from "node:assert/strict";
import { realpathSync } from "node:fs";
import { lstat, mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test, { type TestContext } from "node:test";

import { HostFiles } from "../../../src/host/host-files.js";
import { containsPath, existingCanonicalPath, HostError, HostPolicy } from "../../../src/host/host-policy.js";
import { ManagedWorkspaceCatalog } from "../../../src/workspaces/managed-workspace-catalog.js";
import { RegisteredWorkspaceRegistry } from "../../../src/workspaces/registered-workspace-registry.js";
import { WorkspaceOnboardingService } from "../../../src/workspaces/workspace-onboarding-service.js";
import { windowsPathAlias } from "../../helpers/windows-path-alias.js";

const denied = (error: unknown) => error instanceof HostError && error.code === "HOST_PATH_DENIED";

async function temporaryRoot(t: TestContext): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "bridge-path-alias-"));
  t.after(async () => {
    assert.ok(containsPath(resolve(tmpdir()), resolve(root)));
    assert.notEqual(resolve(root), resolve(tmpdir()));
    await rm(root, { recursive: true, force: true });
  });
  return root;
}

test("canonical paths expand aliases through missing ancestors and propagate resolution failures", async () => {
  const alias = resolve("alias-fixtures", "LONGDI~1");
  const canonical = resolve("alias-fixtures", "Long directory name");
  const resolveExisting = async (path: string): Promise<string> => {
    if (path === alias || path === canonical) return canonical;
    throw Object.assign(new Error("missing"), { code: "ENOENT" });
  };
  assert.equal(await existingCanonicalPath(alias, resolveExisting), canonical);
  for (const suffix of ["auth.json", "policy.json.audit.jsonl", join("missing", "nested", "file")]) {
    const expected = join(canonical, suffix);
    assert.equal(await existingCanonicalPath(join(alias, suffix), resolveExisting), expected);
    assert.equal(await existingCanonicalPath(expected, resolveExisting), expected);
  }
  for (const code of ["EACCES", "ELOOP", "ENOTDIR", "ENOENT"]) {
    const failure = Object.assign(new Error(code), { code });
    await assert.rejects(existingCanonicalPath(join(alias, "missing"), async () => { throw failure; }),
      error => error === failure);
  }
});

test("protected missing paths and manual identity use the same canonical directory through a link alias", async t => {
  const root = await temporaryRoot(t);
  const project = join(root, "project");
  const alias = join(root, "alias");
  await mkdir(project);
  await symlink(project, alias, process.platform === "win32" ? "junction" : "dir");
  const canonical = await realpath(project);
  assert.equal(await realpath(alias), canonical);
  assert.equal(realpathSync.native(alias), canonical);
  const policy = await HostPolicy.create({ version: 1, enabled: true,
    read_roots: [project], write_roots: [project], protected_paths: [join(alias, "missing", "protected")]
  }, join(root, "policy.json"));
  await assert.rejects(policy.check(join(canonical, "missing", "protected", "file"), "write"), denied);
  assert.equal(await policy.check(join(canonical, "ordinary.txt"), "write"), join(canonical, "ordinary.txt"));
  // Configured protection aliases do not enable following links in host tools.
  await assert.rejects(policy.check(join(alias, "ordinary.txt"), "write"), denied);

  const registry = new RegisteredWorkspaceRegistry([{ id: "manual", root: alias }]);
  const catalog = new ManagedWorkspaceCatalog();
  const onboarding = new WorkspaceOnboardingService(registry, catalog, [project]);
  const expected = { workspace_id: "manual", root: alias, source: "manual" };
  assert.deepEqual(await onboarding.bind({ project_path: canonical }), expected);
  registry.replaceWith(new RegisteredWorkspaceRegistry([{ id: "manual", root: alias }]));
  assert.deepEqual(await onboarding.bind({ project_path: canonical }), expected);
  assert.deepEqual(catalog.entries(), []);
});

test("Windows aliases cannot bypass protected files, credentials, audit files or root deletion", {
  skip: process.platform !== "win32"
}, async t => {
  const root = await temporaryRoot(t);
  const alias = windowsPathAlias(root, t);
  const canonical = await realpath(root);
  assert.equal(await realpath(alias), realpathSync.native(alias));
  const home = join(root, "codex-home");
  const empty = join(root, "empty-root");
  await Promise.all([mkdir(home), mkdir(empty)]);
  // Load before any protected leaf exists; missing files must not disable denial.
  const policyPath = join(alias, "policy.json");
  const policy = await HostPolicy.create({ version: 1, enabled: true,
    read_roots: [alias], write_roots: [alias, join(alias, "empty-root")],
    codex_homes: [join(alias, "codex-home")], protected_paths: [join(alias, "missing", "protected")]
  }, policyPath);
  const files = new HostFiles(policy);
  for (const base of [alias, canonical]) {
    for (const leaf of ["policy.json", "policy.json.audit.jsonl", "policy.json.audit.jsonl.previous",
      join("missing", "protected", "file")]) {
      await assert.rejects(files.write(join(base, leaf), "blocked", undefined, true), denied);
    }
    for (const access of ["read", "write"] as const) {
      await assert.rejects(policy.check(join(base, "codex-home", "auth.json"), access), denied);
    }
    await assert.rejects(files.remove(join(base, "empty-root")), denied);
  }
  assert.ok((await lstat(empty)).isDirectory());
  await writeFile(join(home, "auth.json"), "credential-marker");
  await assert.rejects(files.read(join(canonical, "codex-home", "auth.json")), denied);
  const written = await files.write(join(alias, "ordinary.txt"), "allowed");
  assert.equal(written.path, join(canonical, "ordinary.txt"));

  const registry = new RegisteredWorkspaceRegistry([{ id: "manual", root: alias }]);
  const catalog = new ManagedWorkspaceCatalog();
  const onboarding = new WorkspaceOnboardingService(registry, catalog, [alias]);
  const expected = { workspace_id: "manual", root: alias, source: "manual" };
  assert.deepEqual(await onboarding.bind({ project_path: canonical }), expected);
  registry.replaceWith(new RegisteredWorkspaceRegistry([{ id: "manual", root: alias }]));
  assert.deepEqual(await onboarding.bind({ project_path: canonical }), expected);
  assert.deepEqual(catalog.entries(), []);
});

test("audit siblings remain protected when the configured policy filename is an alias", {
  skip: process.platform === "win32" // File symlinks require privileges; Windows directory/8.3 aliases are covered above.
}, async t => {
  const root = await temporaryRoot(t);
  const target = join(root, "long-policy-name.json");
  const alias = join(root, "POLICY~1.JSO");
  await writeFile(target, "{}");
  await symlink(target, alias);
  const policy = await HostPolicy.create({ version: 1, enabled: true, write_roots: [root] }, alias);
  for (const path of [alias + ".audit.jsonl", target + ".audit.jsonl"]) {
    await assert.rejects(policy.check(path, "write"), denied);
  }
  assert.equal(dirname(await policy.check(join(root, "ordinary.txt"), "write")), await realpath(root));
});
