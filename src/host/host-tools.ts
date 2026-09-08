import { appendFile, rename, stat } from "node:fs/promises";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CoreError, serializeError } from "../core/errors.js";

import type { RegisteredWorkspaceTaskService } from "../tasks/registered-workspace-task-service.js";
import { locateCodexSession } from "./codex-sessions.js";
import { runHostCommand } from "./host-command.js";
import { HostFiles } from "./host-files.js";
import { HostError, HostPolicy } from "./host-policy.js";

function jsonContent(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value) }] };
}

class HostAudit {
  private tail: Promise<unknown> = Promise.resolve();
  constructor(private readonly path: string) {}
  record(value: Record<string, unknown>): Promise<void> {
    const work = this.tail.then(async () => {
      try {
        if ((await stat(this.path)).size > 1_048_576) await rename(this.path, this.path + ".previous");
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
      await appendFile(this.path, JSON.stringify({ at: new Date().toISOString(), ...value }) + "\n", { mode: 0o600 });
    });
    this.tail = work.catch(() => {});
    return work;
  }
}

export function registerHostTools(
  server: McpServer,
  policy: HostPolicy,
  service: RegisteredWorkspaceTaskService,
  options: {
    validateText?: (path: string, content: string) => void;
    reloadWorkspaces?: () => Promise<unknown>;
  } = {}
) {
  const files = new HostFiles(policy);
  const audit = new HostAudit(policy.policyPath + ".audit.jsonl");
  const safe = async (operation: string, paths: Record<string, string>, work: () => Promise<unknown>) => {
    try {
      await audit.record({ operation, ...paths, state: "started" });
      const result = await work();
      try { await audit.record({ operation, ...paths, state: "completed" }); }
      catch { return jsonContent({ result, audit_warning: "The operation completed but the final audit record could not be written." }); }
      return jsonContent(result);
    } catch (error) {
      const code = error instanceof HostError || error instanceof CoreError ? error.code : "HOST_OPERATION_FAILED";
      await audit.record({ operation, ...paths, state: "failed", code }).catch(() => {});
      return { isError: true, ...jsonContent({ error: {
        code, message: error instanceof HostError ? error.message : error instanceof CoreError
          ? serializeError(error).message : "The host operation could not be completed."
      } }) };
    }
  };
  const readOnly = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
  const mutation = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };
  const hash = z.string().regex(/^[a-f0-9]{64}$/u);
  const pathSchema = z.string().min(1).max(4096);

  server.registerTool("host_capabilities", {
    description: "Read the administrator-configured host capabilities. File roots constrain file tools. Enabled host commands run with the current OS account's privileges; command_roots constrain only the starting directory, not process access. Desktop GUI control is not provided.",
    inputSchema: {}, annotations: readOnly
  }, () => jsonContent({
    ...policy.config, policy_file: policy.policyPath,
    file_limit_mib: 512, text_write_limit_mib: 2, command_output_limit_bytes: 65_536,
    command_max_seconds: 45, gui_control: false, resumed_tasks: "read-only",
    policy_changes: "local administrator plus runtime restart",
    commands_are_os_sandboxed: false
  }));
  if (!policy.config.enabled) return;

  server.registerTool("read_host_file", {
    description: "Read a bounded file chunk outside Git workspaces, with file size and SHA-256. Use base64 for binary files. Credential files, links and files above 512 MiB are rejected.",
    inputSchema: { path: pathSchema, offset: z.number().int().min(0).optional(),
      max_bytes: z.number().int().min(1).max(262_144).optional(),
      encoding: z.enum(["utf8", "base64"]).optional() }, annotations: readOnly
  }, ({ path, offset, max_bytes, encoding }) => safe("read", { path }, () => files.read(path, offset, max_bytes, encoding)));

  server.registerTool("list_host_path", {
    description: "List one allowed local directory with offset pagination. Does not recurse or follow junctions.",
    inputSchema: { path: pathSchema, offset: z.number().int().min(0).optional(),
      limit: z.number().int().min(1).max(500).optional() }, annotations: readOnly
  }, ({ path, offset, limit }) => safe("list", { path }, () => files.list(path, offset, limit)));

  server.registerTool("write_host_text_file", {
    description: "Create UTF-8 text or replace a reviewed existing file. Creating never overwrites. Replacement requires expected_sha256 from a prior read; stale hashes fail. Host policy and credentials cannot be changed through file tools. Workspace configuration is validated before writing and can be reloaded separately.",
    inputSchema: { path: pathSchema, content: z.string().max(2_097_152),
      expected_sha256: hash.optional(), create_parents: z.boolean().optional().default(false) },
    annotations: { ...mutation, destructiveHint: true }
  }, ({ path, content, expected_sha256, create_parents }) => safe("write", { path }, async () => {
    const checked = await policy.check(path, "write");
    options.validateText?.(checked, content);
    return files.write(checked, content, expected_sha256, create_parents);
  }));

  server.registerTool("copy_file", {
    description: "Copy a regular local file, including images, to an absent allowed destination. Verifies SHA-256 and never overwrites.",
    inputSchema: { source: pathSchema, destination: pathSchema,
      create_parents: z.boolean().optional().default(false) }, annotations: mutation
  }, ({ source, destination, create_parents }) => safe("copy", { source, destination }, () => files.copy(source, destination, create_parents)));

  server.registerTool("move_file", {
    description: "Move one reviewed regular file to an absent allowed destination. Requires its SHA-256 and exact MOVE after user authorization. Copies and verifies before removing the source; directories are not supported.",
    inputSchema: { source: pathSchema, destination: pathSchema, expected_sha256: hash,
      create_parents: z.boolean().optional().default(false), confirmation: z.literal("MOVE") },
    annotations: { ...mutation, destructiveHint: true }
  }, ({ source, destination, expected_sha256, create_parents }) => safe("move", { source, destination }, () => files.move(source, destination, expected_sha256, create_parents)));

  server.registerTool("delete_file", {
    description: "Delete one reviewed regular file or an empty directory after explicit user authorization and exact DELETE. Files require expected_sha256; recursive deletion and deleting configured roots are unsupported.",
    inputSchema: { path: pathSchema, expected_sha256: hash.optional(), confirmation: z.literal("DELETE") },
    annotations: { ...mutation, destructiveHint: true }
  }, ({ path, expected_sha256 }) => safe("delete", { path }, () => files.remove(path, expected_sha256)));

  server.registerTool("run_host_command", {
    description: "Run an explicitly authorized host command with exact EXECUTE. Requires administrator opt-in. Uses an absolute executable and argv without implicit shell, hidden windows, a 1-45 second deadline and bounded output. This is NOT an OS sandbox: commands have the current account's filesystem and network rights. Do not use it for desktop interaction without user permission. Cancellation kills this command, unlike wait_task cancellation.",
    inputSchema: { executable: pathSchema, args: z.array(z.string().max(32_767)).max(256).default([]),
      cwd: pathSchema, timeout_seconds: z.number().min(1).max(45).default(25),
      confirmation: z.literal("EXECUTE") },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true }
  }, ({ executable, args, cwd, timeout_seconds }, { signal }) => safe("command", { executable, cwd },
    () => runHostCommand(policy, executable, args, cwd, timeout_seconds, signal)));

  server.registerTool("resume_codex_thread", {
    description: "Continue an explicitly requested, idle native Codex thread from the configured local homes. Uses the original UUID and cwd through thread/resume, without nesting Codex in a read-only task. The resumed turn remains read-only. Returns task_id; use wait_task and control_task to supervise it. Do not resume a thread active in another client.",
    inputSchema: { thread_id: z.string().uuid(), instruction: z.string().min(1).max(200_000),
      model: z.string().min(1).optional(), reasoning_effort: z.string().min(1).optional() },
    annotations: mutation
  }, ({ thread_id, instruction, model, reasoning_effort }) => safe("resume", { thread_id }, async () => {
    const session = await locateCodexSession(policy, thread_id);
    const { taskId } = service.resumeCodexThread({ ...session, instruction,
      ...(model === undefined ? {} : { model }),
      ...(reasoning_effort === undefined ? {} : { reasoning_effort }) });
    return { task_id: taskId, thread_id: session.threadId, cwd: session.cwd, access: "read-only" };
  }));

  if (options.reloadWorkspaces) {
    server.registerTool("reload_workspace_config", {
      description: "Validate and reload the current workspace configuration after an authorized edit. Requires no active or pending-review tasks. The host policy is separate and remains administrator-only.",
      inputSchema: {}, annotations: mutation
    }, () => safe("reload_workspaces", {}, options.reloadWorkspaces!));
  }
}
