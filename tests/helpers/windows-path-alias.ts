import assert from "node:assert/strict";
import { realpathSync } from "node:fs";
import type { TestContext } from "node:test";

// Retain the runner's actual short TEMP ancestor. Volumes with short names
// disabled still exercise a real case alias, without changing volume settings.
export function windowsPathAlias(directory: string, t: TestContext): string {
  if (process.platform !== "win32") return directory;
  const canonical = realpathSync.native(directory);
  const hasShortName = /~\d/u.test(directory);
  const alias = hasShortName ? directory : canonical.toUpperCase();
  t.diagnostic(hasShortName ? "Using an actual Windows 8.3 path alias." :
    "8.3 names unavailable on this volume; using a Windows case alias (short-name expansion is unit-tested).");
  assert.notEqual(alias, canonical);
  assert.equal(realpathSync.native(alias), canonical);
  return alias;
}
