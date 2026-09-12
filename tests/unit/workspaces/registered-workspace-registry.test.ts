import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";

import { CoreError } from "../../../src/core/errors.js";
import { RegisteredWorkspaceRegistry } from "../../../src/workspaces/registered-workspace-registry.js";

const ROOT = resolve("registered/root");
const absolute = (path: string): string => resolve("registry-fixtures", path);

function expectCode(action: () => unknown, code: string): void {
  assert.throws(action, (error: unknown) => error instanceof CoreError && error.code === code);
}

test("returns the fixed root for a registered id and rejects unknown ids", () => {
  const registry = new RegisteredWorkspaceRegistry([{ id: "known", root: ROOT }]);
  assert.equal(registry.resolve("known"), ROOT);
  expectCode(() => registry.resolve("unknown"), "UNKNOWN_WORKSPACE");
});

test("rejects duplicate ids and invalid identity fields", () => {
  expectCode(() => new RegisteredWorkspaceRegistry([
    { id: "known", root: ROOT },
    { id: "known", root: absolute("other") }
  ]), "WORKSPACE_BOUNDARY_VIOLATION");

  for (const entries of [
    [{ id: "known", root: "relative/root" }],
    [{ id: "known", root: `${ROOT}${process.platform === "win32" ? "\\" : "/"}..${process.platform === "win32" ? "\\" : "/"}root` }],
    [{ id: "", root: ROOT }],
    [{ id: "known", root: "" }]
  ]) {
    expectCode(() => new RegisteredWorkspaceRegistry(entries), "WORKSPACE_BOUNDARY_VIOLATION");
  }
});

test("registerManaged resolves projects and is idempotent for the same identity", () => {
  const registry = new RegisteredWorkspaceRegistry([]);
  registry.registerManaged("managed-1", ROOT);
  registry.registerManaged("managed-1", ROOT);
  assert.equal(registry.resolve("managed-1"), ROOT);
});

test("registerManaged rejects conflicting ids and occupied canonical roots", () => {
  const registry = new RegisteredWorkspaceRegistry([{ id: "manual", root: ROOT }]);
  expectCode(() => registry.registerManaged("managed-1", ROOT), "WORKSPACE_BOUNDARY_VIOLATION");
  registry.registerManaged("managed-1", absolute("managed"));
  expectCode(() => registry.registerManaged("managed-1", absolute("other")), "WORKSPACE_BOUNDARY_VIOLATION");
  expectCode(() => registry.registerManaged("managed-2", absolute("managed")), "WORKSPACE_BOUNDARY_VIOLATION");
});

test("findByRoot returns workspace identity and source", () => {
  const registry = new RegisteredWorkspaceRegistry([{ id: "manual", root: ROOT }]);
  assert.deepEqual(registry.findByRoot(ROOT), { id: "manual", root: ROOT, source: "manual" });
  assert.equal(registry.findByRoot(absolute("unknown")), undefined);
  registry.registerManaged("managed-1", absolute("managed"));
  assert.deepEqual(registry.findByRoot(absolute("managed")), {
    id: "managed-1", root: absolute("managed"), source: "managed"
  });
});

test("manual canonical duplicates remain first-win for lookup", () => {
  const manual = absolute("manual"), alias = absolute("alias"), canonical = absolute("canonical");
  const canonicalize = (root: string): string => root === manual || root === alias ? canonical : root;
  const registry = new RegisteredWorkspaceRegistry([
    { id: "first", root: manual },
    { id: "second", root: alias }
  ], canonicalize);
  assert.deepEqual(registry.findByRoot(canonical), {
    id: "first", root: manual, source: "manual"
  });
  expectCode(() => registry.registerManaged("managed-1", alias), "WORKSPACE_BOUNDARY_VIOLATION");
});

test("manual roots that cannot be canonicalized fall back to the literal root", () => {
  const missing = absolute("definitely-missing");
  const registry = new RegisteredWorkspaceRegistry([{ id: "known", root: missing }]);
  assert.deepEqual(registry.findByRoot(missing), {
    id: "known", root: missing, source: "manual"
  });
});
