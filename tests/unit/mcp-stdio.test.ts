import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const VERSION_MODULE = new URL("../../src/version.js", import.meta.url);

interface ToolResult {
  content: Array<{ type?: string; text?: string } | undefined>;
}

test("workspace configuration strips exactly one leading UTF-8 BOM", async () => {
  const cases = [
    { source: "\uFEFF[]\n", accepted: true },
    { source: "\uFEFF\uFEFF[]\n", accepted: false }
  ] as const;

  for (const { source, accepted } of cases) {
    const configRoot = mkdtempSync(join(tmpdir(), "engineering-bridge-bom-"));
    const configPath = join(configRoot, "workspaces.json");
    writeFileSync(configPath, source);
    const client = new Client({ name: "test-client", version: "1.0.0" });
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [join(process.cwd(), "dist/src/mcp-stdio.js"), configPath],
      cwd: process.cwd(),
      stderr: "pipe"
    });

    try {
      if (!accepted) {
        await assert.rejects(client.connect(transport));
        continue;
      }
      await client.connect(transport);
      const listed = await client.listTools();
      assert.equal(listed.tools.some(({ name }) => name === "run_temp"), true);
    } finally {
      try {
        await client.close();
      } finally {
        rmSync(configRoot, { recursive: true, force: true });
      }
    }
  }
});

test("MCP exposes unified work operations and rejects removed APIs", async t => {
  const dir = mkdtempSync(join(tmpdir(), "bridge-work-surface-"));
  t.after(() => rmSync(dir, {recursive:true,force:true}));
  const configPath=join(dir,"workspaces.json");
  writeFileSync(configPath,"[]");
  const client=new Client({name:"test",version:"1"});
  await client.connect(new StdioClientTransport({command:process.execPath,
    args:[join(process.cwd(),"dist/src/mcp-stdio.js"),configPath],stderr:"pipe"}));
  try {
    const {VERSION}=await import(VERSION_MODULE.href);
    assert.equal(client.getServerVersion()?.version,VERSION);
    const tools=(await client.listTools()).tools;
    for (const name of ["open_work","list_work","continue_work","run_temp","finish_work","manage_work","work_retention"]) {
      assert.ok(tools.some(tool=>tool.name===name));
    }
    for (const name of ["run_task","resume_codex_thread","generate_controlled_patch","refine_controlled_patch"]) {
      assert.ok(!tools.some(tool=>tool.name===name));
      assert.equal((await client.callTool({name,arguments:{}})).isError,true);
    }
    for(const tool of tools)assert.equal("confirmation" in (tool.inputSchema.properties??{}),false);
    for (const name of ["run_temp","continue_work"]) {
      const props=tools.find(tool=>tool.name===name)!.inputSchema.properties!;
      assert.ok(props.model);assert.ok(props.reasoning_effort);
    }
    const result=await client.callTool({name:"run_temp",arguments:{workspace_id:"missing",instruction:"inspect"}});
    assert.equal(result.isError,true);
    assert.match(JSON.stringify(result),/UNKNOWN_WORKSPACE/);
  } finally { await client.close(); }
});

test("temporary execution validates executor options before dispatch",async t=>{
  const dir=mkdtempSync(join(tmpdir(),"bridge-temp-args-"));
  t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const config=join(dir,"workspaces.json");writeFileSync(config,"[]");
  const client=new Client({name:"test",version:"1"});
  await client.connect(new StdioClientTransport({command:process.execPath,
    args:[join(process.cwd(),"dist/src/mcp-stdio.js"),config],stderr:"pipe"}));
  try {
    for(const executor of [undefined,"codex","dsh"]){
      const result=await client.callTool({name:"run_temp",arguments:{workspace_id:"missing",instruction:"inspect",...(executor?{executor}:{})}});
      assert.equal(result.isError,true);assert.match(JSON.stringify(result),/UNKNOWN_WORKSPACE/);
    }
    const unsupported=await client.callTool({name:"run_temp",arguments:{workspace_id:"missing",instruction:"inspect",executor:"dsh",model:"any"}});
    assert.match(JSON.stringify(unsupported),/UNSUPPORTED_ACTION/);
    assert.equal((await client.callTool({name:"run_temp",arguments:{workspace_id:"missing",instruction:"inspect",executor:"unknown"}})).isError,true);
  }finally{await client.close();}
});

test("bind_project and create_project register workspaces inside approved project roots", async () => {
  const approved = mkdtempSync(join(tmpdir(), "engineering-bridge-approved-"));
  const configDir = mkdtempSync(join(tmpdir(), "engineering-bridge-onboard-"));
  const configPath = join(configDir, "workspaces.json");
  const manualProject = join(approved, "manual-project");
  mkdirSync(manualProject);
  const otherProject = join(approved, "other-project");
  mkdirSync(otherProject);
  writeFileSync(configPath, `${JSON.stringify([
    { kind: "project_root", root: approved },
    { id: "manual", root: manualProject, allow_write: true }
  ], null, 2)}\n`);

  const client = new Client({ name: "test-client", version: "1.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [join(process.cwd(), "dist/src/mcp-stdio.js"), configPath],
    cwd: process.cwd(),
    stderr: "pipe"
  });

  const call = async (name: string, args: Record<string, unknown>): Promise<{ isError: boolean; body: unknown }> => {
    const result = await client.callTool({ name, arguments: args });
    const content = result.content as ToolResult["content"];
    const text = content[0]?.text ?? "";
    let body: unknown;
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      body = { raw: text };
    }
    return { isError: result.isError === true, body };
  };

  try {
    await client.connect(transport);

    // Binding an existing manual workspace returns its real allow_write and source.
    const manualBind = await call("bind_project", {
      project_path: manualProject
    });
    assert.equal(manualBind.isError, false);
    assert.deepEqual(manualBind.body, {
      workspace_id: "manual",
      root: manualProject,
      allow_write: true,
      source: "manual"
    });

    // Binding a new project creates a managed workspace and reuses its id.
    const firstBind = await call("bind_project", {
      project_path: otherProject
    });
    assert.equal(firstBind.isError, false);
    const firstBody = firstBind.body as { workspace_id?: unknown; root?: unknown; allow_write?: unknown; source?: unknown };
    assert.equal(typeof firstBody.workspace_id, "string");
    assert.equal(firstBody.root, realpathSync(otherProject));
    assert.equal(firstBody.allow_write, false);
    assert.equal(firstBody.source, "managed");

    const secondBind = await call("bind_project", {
      project_path: otherProject
    });
    assert.deepEqual(secondBind.body, firstBind.body);

    // The managed workspace is immediately usable for task routing.
    const run = await call("run_temp", {
      workspace_id: firstBody.workspace_id,
      instruction: "inspect",
      executor: "dsh"
    });
    assert.equal(run.isError, false);
    assert.equal(typeof (run.body as { task_id?: unknown }).task_id, "string");

    // create_project performs mkdir + git init and reports an unborn HEAD.
    const created = await call("create_project", {
      parent: approved,
      name: "created-project"
    });
    assert.equal(created.isError, false);
    const createdBody = created.body as { workspace_id?: unknown; root?: unknown; allow_write?: unknown; git?: unknown };
    assert.equal(typeof createdBody.workspace_id, "string");
    assert.equal(createdBody.root, realpathSync(join(approved, "created-project")));
    assert.equal(createdBody.allow_write, false);
    assert.deepEqual(createdBody.git, { initialized: true, head: "unborn" });
    assert.equal(readFileSync(join(approved, "created-project", ".git", "HEAD"), "utf8").includes("ref:"), true);

    // Missing project name is rejected by the schema without side effects.
    const wrongConfirmation = await call("create_project", {
      parent: approved,
      name: ""
    });
    assert.equal(wrongConfirmation.isError, true);
    assert.equal(JSON.stringify(wrongConfirmation.body).includes("workspace_id"), false);

    // Paths outside every approved root are rejected with a structured error.
    const outside = mkdtempSync(join(tmpdir(), "engineering-bridge-outside-"));
    const outsideBind = await call("bind_project", {
      project_path: outside
    });
    assert.equal(outsideBind.isError, true);
    assert.deepEqual(outsideBind.body, {
      error: {
        code: "WORKSPACE_BOUNDARY_VIOLATION",
        message: "The workspace boundary could not be verified."
      }
    });
  } finally {
    await client.close();
  }
});

test("startup rejects relative or non-normalized project_root entries and accepts a valid one", async () => {
  for (const root of ["relative/root", "/registered/../root"]) {
    const configDir = mkdtempSync(join(tmpdir(), "engineering-bridge-badroot-"));
    const configPath = join(configDir, "workspaces.json");
    writeFileSync(configPath, `${JSON.stringify([{ kind: "project_root", root }], null, 2)}\n`);

    const client = new Client({ name: "test-client", version: "1.0.0" });
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [join(process.cwd(), "dist/src/mcp-stdio.js"), configPath],
      cwd: process.cwd(),
      stderr: "pipe"
    });

    // The server exits during startup, so connecting must fail.
    await assert.rejects(client.connect(transport));
    await client.close();
  }

  // A valid absolute, normalized project_root still boots.
  const configDir = mkdtempSync(join(tmpdir(), "engineering-bridge-goodroot-"));
  const configPath = join(configDir, "workspaces.json");
  writeFileSync(configPath, `${JSON.stringify([{ kind: "project_root", root: configDir }], null, 2)}\n`);
  const client = new Client({ name: "test-client", version: "1.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [join(process.cwd(), "dist/src/mcp-stdio.js"), configPath],
    cwd: process.cwd(),
    stderr: "pipe"
  });

  try {
    await client.connect(transport);
    const listed = await client.listTools();
    assert.equal(listed.tools.some(({ name }) => name === "bind_project"), true);
  } finally {
    await client.close();
  }
});

test("bind_project fails closed when no project_root is configured", async () => {
  const configDir = mkdtempSync(join(tmpdir(), "engineering-bridge-noroots-"));
  const configPath = join(configDir, "workspaces.json");
  const project = join(configDir, "project");
  mkdirSync(project);
  writeFileSync(configPath, "[]\n");

  const client = new Client({ name: "test-client", version: "1.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [join(process.cwd(), "dist/src/mcp-stdio.js"), configPath],
    cwd: process.cwd(),
    stderr: "pipe"
  });

  try {
    await client.connect(transport);
    const result = await client.callTool({
      name: "bind_project",
      arguments: { project_path: project, confirmation: "BIND" }
    });
    assert.equal(result.isError, true);
    const content = result.content as ToolResult["content"];
    const body = JSON.parse(content[0]?.text ?? "") as { error?: unknown };
    assert.deepEqual(body.error, {
      code: "WORKSPACE_BOUNDARY_VIOLATION",
      message: "The workspace boundary could not be verified."
    });
  } finally {
    await client.close();
  }
});

test("authorize_workspace_write persists for managed workspaces and rejects manual ones", async () => {
  const approved = mkdtempSync(join(tmpdir(), "engineering-bridge-authorize-"));
  const configDir = mkdtempSync(join(tmpdir(), "engineering-bridge-authorize-config-"));
  const configPath = join(configDir, "workspaces.json");
  const managedProject = join(approved, "managed-project");
  const manualProject = join(approved, "manual-project");
  mkdirSync(managedProject);
  mkdirSync(manualProject);
  writeFileSync(configPath, `${JSON.stringify([
    { kind: "project_root", root: approved },
    { id: "manual", root: manualProject, allow_write: true }
  ], null, 2)}\n`);

  const client = new Client({ name: "test-client", version: "1.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [join(process.cwd(), "dist/src/mcp-stdio.js"), configPath],
    cwd: process.cwd(),
    stderr: "pipe"
  });

  const call = async (name: string, args: Record<string, unknown>): Promise<{ isError: boolean; body: unknown }> => {
    const result = await client.callTool({ name, arguments: args });
    const content = result.content as ToolResult["content"];
    const text = content[0]?.text ?? "";
    let body: unknown;
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      body = { raw: text };
    }
    return { isError: result.isError === true, body };
  };

  try {
    await client.connect(transport);

    const bound = await call("bind_project", {
      project_path: managedProject
    });
    const workspaceId = (bound.body as { workspace_id?: string }).workspace_id;
    assert.equal(typeof workspaceId, "string");

    // AUTHORIZE a managed workspace: persisted in the catalog file.
    const authorized = await call("authorize_workspace_write", {
      workspace_id: workspaceId
    });
    assert.equal(authorized.isError, false);
    assert.deepEqual(authorized.body, { workspace_id: workspaceId, allow_write: true });
    const catalogFile = `${configPath}.managed-workspaces.json`;
    const catalog = JSON.parse(readFileSync(catalogFile, "utf8")) as { workspaces: Array<{ id: string; allow_write?: boolean }> };
    assert.equal(catalog.workspaces.find(({ id }) => id === workspaceId)?.allow_write, true);

    // Idempotent on repeat.
    const again = await call("authorize_workspace_write", {
      workspace_id: workspaceId
    });
    assert.deepEqual(again.body, authorized.body);

    // Manual workspaces stay authoritative through workspaces.json.
    const manual = await call("authorize_workspace_write", {
      workspace_id: "manual"
    });
    assert.equal(manual.isError, true);
    assert.deepEqual(manual.body, {
      error: {
        code: "WORKSPACE_PRECONDITION_FAILED",
        message: "The workspace preconditions were not met."
      }
    });

    // Unknown workspaces are unchanged.
    const missing = await call("authorize_workspace_write", {
      workspace_id: "missing"
    });
    assert.equal(missing.isError, true);
    assert.deepEqual(missing.body, {
      error: {
        code: "UNKNOWN_WORKSPACE",
        message: "The requested workspace is not registered."
      }
    });

    // Missing workspace ID is rejected by the schema.
    const wrong = await call("authorize_workspace_write", {
      workspace_id: ""
    });
    assert.equal(wrong.isError, true);
    assert.equal(JSON.stringify(wrong.body).includes("allow_write"), false);
  } finally {
    await client.close();
  }
});



test("submit_controlled_patch registers a submitted proposal and task_result reports source submitted without an executor", async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "engineering-bridge-submit-")));
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["config", "user.name", "Test User"], { cwd: root });
  execFileSync("git", ["config", "user.email", "test@example.invalid"], { cwd: root });
  writeFileSync(join(root, "note.txt"), "before\n");
  execFileSync("git", ["add", "note.txt"], { cwd: root });
  execFileSync("git", ["commit", "-qm", "base"], { cwd: root });
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const validPatch = `diff --git a/note.txt b/note.txt
index 90be1f3..3b18e51 100644
--- a/note.txt
+++ b/note.txt
@@ -1 +1 @@
-before
+after
`;

  const configDir = mkdtempSync(join(tmpdir(), "engineering-bridge-submit-config-"));
  const configPath = join(configDir, "workspaces.json");
  writeFileSync(configPath, `${JSON.stringify([{ id: "workspace", root, allow_write: true }], null, 2)}\n`);

  const client = new Client({ name: "test-client", version: "1.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [join(process.cwd(), "dist/src/mcp-stdio.js"), configPath],
    cwd: process.cwd(),
    stderr: "pipe"
  });

  const call = async (name: string, args: Record<string, unknown>): Promise<{ isError: boolean; body: Record<string, unknown> }> => {
    const result = await client.callTool({ name, arguments: args });
    const content = result.content as ToolResult["content"];
    const text = content[0]?.text ?? "";
    let body: unknown;
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      body = { raw: text };
    }
    return { isError: result.isError === true, body: body as Record<string, unknown> };
  };

  try {
    await client.connect(transport);

    const submitted = await call("submit_controlled_patch", {
      workspace_id: "workspace",
      base_head: head,
      diff: validPatch
    });
    assert.equal(submitted.isError, false);
    const taskId = submitted.body.task_id;
    assert.equal(typeof taskId, "string");
    assert.equal(submitted.body.base_head, head);
    if (typeof taskId !== "string") return;

    const view = await call("task_result", { task_id: taskId });
    assert.equal(view.body.state, "completed");
    assert.equal(view.body.source, "submitted");
    assert.equal("executor" in view.body, false);
    assert.equal(view.body.output, validPatch);

    const taskView = { ...view.body };
    delete taskView.mcp_diagnostics;
    const mcpDiagnostics = view.body.mcp_diagnostics as { serialized_task_view_bytes?: unknown } | undefined;
    assert.equal(
      mcpDiagnostics?.serialized_task_view_bytes,
      Buffer.byteLength(JSON.stringify(taskView), "utf8")
    );
    assert.equal(JSON.stringify(view.body.mcp_diagnostics).includes(validPatch), false);

    // A stale base_head is rejected with the structured preflight error.
    const stale = await call("submit_controlled_patch", {
      workspace_id: "workspace",
      base_head: "0".repeat(40),
      diff: validPatch
    });
    assert.equal(stale.isError, true);
    assert.deepEqual(stale.body, {
      error: {
        code: "WORKSPACE_PRECONDITION_FAILED",
        message: "The workspace preconditions were not met."
      }
    });

    // A submitted-but-not-applied proposal refuses exact COMMIT before APPLY.
    const earlyCommit = await call("commit_controlled_patch", {
      patch_task_id: taskId,
      message: "feat: commit submitted patch"
    });
    assert.equal(earlyCommit.isError, true);
    assert.deepEqual(earlyCommit.body, {
      raw: "The requested state transition is not allowed."
    });

    // The submitted proposal is applied through the existing APPLY tool.
    const applied = await call("apply_controlled_patch", {
      patch_task_id: taskId
    });
    assert.equal(applied.isError, false);
    assert.deepEqual(applied.body, { patch_task_id: taskId, applied: true, changed_paths: ["note.txt"] });
    assert.equal(readFileSync(join(root, "note.txt"), "utf8"), "after\n");

    // An empty commit message is rejected by the MCP input schema before any
    // business logic: the SDK validation prefix appears, no commit payload is
    // produced, and HEAD plus the applied tracked dirt stay untouched.
    const lowercased = await call("commit_controlled_patch", {
      patch_task_id: taskId,
      message: ""
    });
    assert.equal(lowercased.isError, true);
    assert.equal(typeof lowercased.body.raw, "string");
    assert.match(
      String(lowercased.body.raw),
      /Input validation error: Invalid arguments for tool commit_controlled_patch:/u
    );
    assert.equal(JSON.stringify(lowercased.body).includes("committed"), false);
    assert.equal(
      execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
      head
    );
    assert.equal(
      execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }),
      " M note.txt\n"
    );

    // Exact COMMIT creates one commit containing only the already-APPLYed proposal.
    const committed = await call("commit_controlled_patch", {
      patch_task_id: taskId,
      message: "feat: commit submitted patch"
    });
    assert.equal(committed.isError, false);
    assert.equal(committed.body.patch_task_id, taskId);
    assert.equal(committed.body.committed, true);
    assert.match(String(committed.body.commit_sha), /^[0-9a-f]{40,64}$/u);
    assert.equal(
      execFileSync("git", ["log", "-1", "--format=%s"], { cwd: root, encoding: "utf8" }).trim(),
      "feat: commit submitted patch"
    );
    assert.equal(
      execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
      committed.body.commit_sha
    );
    assert.equal(execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }), "");
  } finally {
    await client.close();
  }
});

test("controlled patch validation tools enforce fixed schemas, defaults, and fixed validation input", async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "engineering-bridge-validation-mcp-")));
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["config", "user.name", "Test User"], { cwd: root });
  execFileSync("git", ["config", "user.email", "test@example.invalid"], { cwd: root });
  writeFileSync(join(root, "note.txt"), "before\n");
  execFileSync("git", ["add", "note.txt"], { cwd: root });
  execFileSync("git", ["commit", "-qm", "base"], { cwd: root });
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const validPatch = `diff --git a/note.txt b/note.txt
index 90be1f3..3b18e51 100644
--- a/note.txt
+++ b/note.txt
@@ -1 +1 @@
-before
+after
`;

  const configDir = mkdtempSync(join(tmpdir(), "engineering-bridge-validation-mcp-config-"));
  const configPath = join(configDir, "workspaces.json");
  const profilePath = `${configPath}.validation-profiles.json`;
  writeFileSync(configPath, `${JSON.stringify([{ id: "workspace", root }], null, 2)}\n`);

  const client = new Client({ name: "test-client", version: "1.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [join(process.cwd(), "dist/src/mcp-stdio.js"), configPath],
    cwd: process.cwd(),
    stderr: "pipe"
  });

  const call = async (name: string, args: Record<string, unknown>): Promise<{ isError: boolean; body: Record<string, unknown> }> => {
    const result = await client.callTool({ name, arguments: args });
    const content = result.content as ToolResult["content"];
    const text = content[0]?.text ?? "";
    let body: unknown;
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      body = { raw: text };
    }
    return { isError: result.isError === true, body: body as Record<string, unknown> };
  };

  const profile = {
    preparation: [],
    validation: [{ name: "test", argv: ["npm", "test"] }]
  };

  try {
    await client.connect(transport);

    const tools = new Map((await client.listTools()).tools.map((tool) => [tool.name, tool]));
    const configureSchema = tools.get("configure_validation_profile")?.inputSchema as {
      properties?: Record<string, { const?: unknown }>;
      additionalProperties?: boolean;
    } | undefined;
    assert.equal(configureSchema?.properties?.confirmation, undefined);
    assert.equal(configureSchema?.additionalProperties, false);

    const validationSchema = tools.get("validate_controlled_patch")?.inputSchema as {
      properties?: Record<string, unknown>;
      required?: string[];
      additionalProperties?: boolean;
    } | undefined;
    assert.deepEqual(Object.keys(validationSchema?.properties ?? {}), ["patch_task_id"]);
    assert.deepEqual(validationSchema?.required, ["patch_task_id"]);
    assert.equal(validationSchema?.additionalProperties, false);

    const submitted = await call("submit_controlled_patch", {
      workspace_id: "workspace",
      base_head: head,
      diff: validPatch
    });
    assert.equal(submitted.isError, false);
    const patchTaskId = submitted.body.task_id;
    assert.equal(typeof patchTaskId, "string");
    if (typeof patchTaskId !== "string") return;

    const missingProfile = await call("validate_controlled_patch", {
      patch_task_id: patchTaskId
    });
    assert.equal(missingProfile.isError, false);
    assert.equal(missingProfile.body.status, "INCOMPLETE");
    assert.equal(missingProfile.body.reason, "validation_profile_missing");

    for (const args of [
      { patch_task_id: patchTaskId, command: "npm test" },
      { patch_task_id: patchTaskId, timeout_seconds: 1 }
    ]) {
      const rejected = await call("validate_controlled_patch", args);
      assert.equal(rejected.isError, true);
      assert.equal(JSON.stringify(rejected.body).includes("validation_profile_missing"), false);
    }

    const emptyArgv = await call("configure_validation_profile", {
      workspace_id: "workspace",
      profile: {
        preparation: [],
        validation: [{ name: "test", argv: [] }]
      }
    });
    assert.equal(emptyArgv.isError, true);
    assert.equal(existsSync(profilePath), false);

    const configured = await call("configure_validation_profile", {
      workspace_id: "workspace",
      profile
    });
    assert.equal(configured.isError, false);
    assert.deepEqual(JSON.parse(readFileSync(profilePath, "utf8")), {
      version: 1,
      profiles: [{
        workspace_id: "workspace",
        preparation: [],
        validation: [{ name: "test", argv: ["npm", "test"] }],
        default_step_timeout_seconds: 600,
        total_timeout_seconds: 1200
      }]
    });
  } finally {
    await client.close();
  }
});

test("malformed validation profile state stays lazy for startup, listing, and an existing safe tool path", async () => {
  const configDir = realpathSync(mkdtempSync(join(tmpdir(), "engineering-bridge-validation-lazy-")));
  const configPath = join(configDir, "workspaces.json");
  const profilePath = `${configPath}.validation-profiles.json`;
  writeFileSync(configPath, `${JSON.stringify([{ id: "workspace", root: configDir }], null, 2)}\n`);
  writeFileSync(profilePath, "{not-json\n");

  const client = new Client({ name: "test-client", version: "1.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [join(process.cwd(), "dist/src/mcp-stdio.js"), configPath],
    cwd: process.cwd(),
    stderr: "pipe"
  });

  const call = async (name: string, args: Record<string, unknown>): Promise<{ isError: boolean; body: Record<string, unknown> }> => {
    const result = await client.callTool({ name, arguments: args });
    const content = result.content as ToolResult["content"];
    const text = content[0]?.text ?? "";
    let body: unknown;
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      body = { raw: text };
    }
    return { isError: result.isError === true, body: body as Record<string, unknown> };
  };

  try {
    await client.connect(transport);
    const listed = await client.listTools();
    assert.equal(listed.tools.some(({ name }) => name === "validate_controlled_patch"), true);

    const run = await call("run_temp", {
      workspace_id: "missing",
      instruction: "inspect",
      executor: "dsh"
    });
    assert.equal(run.isError, true);
    assert.match(JSON.stringify(run.body), /UNKNOWN_WORKSPACE/u);
    assert.equal(readFileSync(profilePath, "utf8"), "{not-json\n");

    const configuration = await call("configure_validation_profile", {
      workspace_id: "workspace",
      profile: { preparation: [], validation: [] }
    });
    assert.equal(configuration.isError, true);
    assert.deepEqual(configuration.body, {
      error: {
        code: "INTERNAL_ERROR",
        message: "The request could not be completed."
      }
    });
    assert.equal(readFileSync(profilePath, "utf8"), "{not-json\n");
  } finally {
    await client.close();
  }
});
