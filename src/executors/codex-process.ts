import { spawn } from "node:child_process";
import type { ChildProcessWithoutNullStreams, SpawnOptionsWithoutStdio } from "node:child_process";
import { resolveCommand } from "./command-resolution.js";

export type ProcessStarter = (executable: string, args: readonly string[], options: SpawnOptionsWithoutStdio) => ChildProcessWithoutNullStreams;
const ENVIRONMENT_ALLOWLIST = ["PATH", "HOME", "CODEX_HOME", "TMPDIR", "LANG", "LC_ALL", "USER", "LOGNAME",
  "SystemRoot", "WINDIR", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "TEMP", "TMP"] as const;

export function startCodexAppServer(cwd: string, host: Readonly<NodeJS.ProcessEnv>,
  platform: NodeJS.Platform = process.platform, start: ProcessStarter = spawn) {
  const env: NodeJS.ProcessEnv = {};
  for (const key of ENVIRONMENT_ALLOWLIST) if (host[key]) env[key] = host[key];
  if (host.ENGINEERING_BRIDGE_CODEX_FORWARD_PROXY === "1") {
    for (const key of ["HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY"]) if (host[key]) env[key] = host[key];
  }
  const options: SpawnOptionsWithoutStdio = {
    cwd, shell: false, windowsHide: true, stdio: ["pipe", "pipe", "pipe"],
    detached: platform !== "win32", env
  };
  const args = ["app-server", "--stdio"];
  const provider = host.ENGINEERING_BRIDGE_CODEX_PROVIDER;
  if (provider !== undefined) {
    if (!/^[a-zA-Z0-9_-]+$/u.test(provider)) throw new Error("Invalid configured provider.");
    args.push("-c", "model_provider=" + JSON.stringify(provider));
  }
  if (host.ENGINEERING_BRIDGE_CODEX_DISABLE_MCP === "1") args.push("-c", "mcp_servers={}");
  const resolved = resolveCommand(host, "codex", {
    nodeTarget: ["@openai", "codex", "bin", "codex.js"], platform
  });
  if (resolved.kind === "direct") return start(resolved.executable, args, options);
  if (resolved.kind === "node-launcher") return start(process.execPath, [resolved.scriptPath, ...args], options);
  return start("codex", args, options);
}
