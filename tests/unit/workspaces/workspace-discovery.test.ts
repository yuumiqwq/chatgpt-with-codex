import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { RegisteredWorkspaceRegistry } from "../../../src/workspaces/registered-workspace-registry.js";

test("workspace discovery returns registered projects only and preserves ambiguous matches", () => {
  const registry = new RegisteredWorkspaceRegistry([
    { id: "one", root: resolve("projects/alpha") },
    { id: "two", root: resolve("other/alpha"), allow_write: true }
  ]);
  registry.registerManaged("three", resolve("projects/beta"));
  assert.equal(registry.list().length, 3);
  assert.equal(registry.list(" ALPHA ").length, 2);
  assert.equal(registry.list("missing").length, 0);
  assert.equal(registry.list("THREE")[0]?.name, "beta");
  assert.equal(registry.list("two")[0]?.allow_write, true);
  assert.equal(registry.list("three")[0]?.source, "managed");
});
