import { lstat, open, readdir, stat } from "node:fs/promises";
import { join } from "node:path";

import { absolutePath, checkAncestors, HostError, HostPolicy } from "./host-policy.js";

export function normalizeCodexPath(value: string): string {
  return absolutePath(process.platform === "win32" && /^\\\\\?\\[a-z]:\\/iu.test(value) ? value.slice(4) : value);
}

export async function locateCodexSession(policy: HostPolicy, threadId: string) {
  if (!policy.config.enabled) throw new HostError("HOST_DISABLED", "Host operations are not enabled.");
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu.test(threadId)) {
    throw new HostError("CODEX_THREAD_NOT_FOUND", "A native Codex thread UUID is required.");
  }
  const wanted = threadId.toLowerCase();
  let inspected = 0;
  for (const codexHome of policy.config.codex_homes) {
    if (!policy.config.follow_links) await checkAncestors(codexHome);
    for (const directory of ["sessions", "archived_sessions"]) {
      const pending = [{ path: join(codexHome, directory), depth: 0 }];
      while (pending.length) {
        const current = pending.pop()!;
        let entries;
        try {
          if (!policy.config.follow_links) await checkAncestors(current.path);
          entries = await readdir(current.path, { withFileTypes: true });
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
          throw error;
        }
        for (const entry of entries) {
          if (++inspected > 100_000) throw new HostError("CODEX_SESSION_SCAN_LIMIT", "The session search exceeded its bounded entry limit.");
          if (entry.isSymbolicLink() && !policy.config.follow_links) continue;
          const path = join(current.path, entry.name);
          const info = entry.isSymbolicLink() ? await stat(path) : entry;
          if (info.isDirectory() && current.depth < 4) {
            pending.push({ path, depth: current.depth + 1 });
          } else if (info.isFile() && entry.name.toLowerCase().includes(wanted) && entry.name.endsWith(".jsonl")) {
            if (!policy.config.follow_links) await checkAncestors(path);
            if ((await lstat(path)).nlink > 1) continue;
            const handle = await open(path, "r");
            let metadata: { type?: string; payload?: { id?: string; cwd?: string } };
            try {
              const buffer = Buffer.alloc(1_048_576);
              const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
              const newline = buffer.subarray(0, bytesRead).indexOf(10);
              if (newline < 0) continue;
              metadata = JSON.parse(buffer.subarray(0, newline).toString("utf8"));
            } finally { await handle.close(); }
            if (metadata.type !== "session_meta" || metadata.payload?.id?.toLowerCase() !== wanted ||
                typeof metadata.payload.cwd !== "string") continue;
            // Codex may serialize a local Windows cwd with an extended prefix.
            // Only an ordinary drive path from validated local metadata is normalized.
            const cwd = await policy.check(normalizeCodexPath(metadata.payload.cwd), "read");
            if (!(await lstat(cwd)).isDirectory()) throw new HostError("CODEX_THREAD_CWD_MISSING", "The original thread directory is not available.");
            return { threadId: wanted, codexHome, cwd, rolloutPath: path };
          }
        }
      }
    }
  }
  throw new HostError("CODEX_THREAD_NOT_FOUND", "The thread was not found in the configured local Codex homes.");
}
