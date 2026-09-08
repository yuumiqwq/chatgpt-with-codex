import assert from "node:assert/strict";
import { resolve } from "node:path";
import test, { type TestContext } from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { ExecutorResult } from "../../src/executors/executor.js";
import { registerTaskResultTools } from "../../src/task-result-tools.js";
import { RegisteredWorkspaceTaskService } from "../../src/tasks/registered-workspace-task-service.js";
import { RegisteredWorkspaceRegistry } from "../../src/workspaces/registered-workspace-registry.js";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

async function harness(t: TestContext) {
  const pending = deferred<ExecutorResult>();
  let interrupts = 0;
  const registry = new RegisteredWorkspaceRegistry([
    { id: "known", root: resolve(".") }
  ]);
  const service = new RegisteredWorkspaceTaskService(registry, () => ({
    execute: () => pending.promise,
    interrupt: async () => { interrupts += 1; }
  }));
  const server = new McpServer({ name: "test-server", version: "1.0.0" });
  registerTaskResultTools(server, service);
  const client = new Client({ name: "test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  t.after(async () => {
    pending.resolve({ kind: "completed", output: "cleanup" });
    await client.close();
    await server.close();
  });
  await server.connect(serverTransport);
  await client.connect(clientTransport);

  const call = async (name: string, args: Record<string, unknown>) => {
    const result = await client.callTool({ name, arguments: args });
    const content = result.content as Array<{ type?: string; text?: string }>;
    assert.equal(content[0]?.type, "text");
    assert.equal(typeof content[0]?.text, "string");
    return {
      isError: result.isError === true,
      body: JSON.parse(content[0]!.text!) as Record<string, unknown>
    };
  };
  return { service, client, pending, call, interrupts: () => interrupts };
}

test("wait_task lists its timeout bounds and default beside task_result", async (t) => {
  const { client } = await harness(t);
  const listed = await client.listTools();
  assert.deepEqual(listed.tools.map(({ name }) => name), ["task_result", "wait_task"]);
  const schema = listed.tools.find(({ name }) => name === "wait_task")!.inputSchema;
  assert.deepEqual(schema.required, ["task_id"]);
  const timeout = schema.properties?.timeout_seconds as {
    type: string; minimum: number; maximum: number; default: number;
  };
  assert.equal(timeout.type, "number");
  assert.equal(timeout.minimum, 1);
  assert.equal(timeout.maximum, 45);
  assert.equal(timeout.default, 25);
  for (const value of [0, 46, "25"]) {
    const result = await client.callTool({
      name: "wait_task",
      arguments: { task_id: "unknown", timeout_seconds: value }
    });
    assert.equal(result.isError, true);
  }
});

test("wait_task immediately returns ready submitted and failed views with task_result formatting", { timeout: 5000 }, async (t) => {
  const { service, call } = await harness(t);
  const submitted = service.submitControlledPatchTask("caller diff", true);
  const failed = service.startTask({ workspace_id: "missing", instruction: "inspect" });
  await Promise.resolve();

  for (const taskId of [submitted.taskId, failed.taskId]) {
    const expected = await call("task_result", { task_id: taskId });
    assert.equal(expected.body.ready, true);
    assert.deepEqual(await call("wait_task", { task_id: taskId }), expected);
    assert.deepEqual(await call("wait_task", {
      task_id: taskId, timeout_seconds: 45
    }), expected);
    const { mcp_diagnostics, ...view } = expected.body;
    assert.deepEqual(mcp_diagnostics, {
      serialized_task_view_bytes: Buffer.byteLength(JSON.stringify(view), "utf8")
    });
  }
});

test("wait_task observes running to supervisor review without accepting the task", { timeout: 5000 }, async (t) => {
  const { service, pending, call } = await harness(t);
  const { taskId } = service.startTask({ workspace_id: "known", instruction: "inspect" });
  await Promise.resolve();
  assert.equal(service.taskView(taskId)?.state, "running");
  const waiting = service.waitTask(taskId, 45);
  pending.resolve({ kind: "completed", output: "review me", threadId: "thread-1" });
  const view = await waiting;
  assert.equal(view?.state, "waiting_for_supervisor_review");
  assert.equal(view?.ready, true);
  assert.equal(view?.review_output, "review me");
  assert.equal(view?.output, undefined);
  const result = await call("wait_task", { task_id: taskId });
  assert.deepEqual(result, await call("task_result", { task_id: taskId }));
  assert.equal(result.body.thread_id, "thread-1");
  assert.equal(result.body.review_output, "review me");
  await service.controlTask(taskId, "accept");
  assert.equal((await call("wait_task", { task_id: taskId })).body.output, "review me");
});

test("wait_task MCP timeout returns a running view and leaves execution alive", { timeout: 5000 }, async (t) => {
  const { service, pending, call, interrupts } = await harness(t);
  const { taskId } = service.startTask({ workspace_id: "known", instruction: "inspect" });
  await Promise.resolve();
  const before = await call("task_result", { task_id: taskId });
  assert.equal(before.body.state, "running");
  assert.equal(before.body.ready, false);
  const started = performance.now();
  const result = await call("wait_task", { task_id: taskId, timeout_seconds: 1 });
  assert.ok(performance.now() - started >= 900);
  assert.deepEqual(result, before);
  assert.equal(interrupts(), 0);
  assert.equal(service.taskView(taskId)?.state, "running");
  pending.resolve({ kind: "completed", output: "finished later" });
  const ready = await call("wait_task", { task_id: taskId, timeout_seconds: 1 });
  assert.equal(ready.body.ready, true);
  assert.equal(ready.body.review_output, "finished later");
});

test("wait_task returns UNKNOWN_TASK for invalid and unknown IDs", { timeout: 5000 }, async (t) => {
  const { service, call } = await harness(t);
  for (const taskId of ["invalid", "00000000-0000-4000-8000-000000000000"]) {
    assert.equal(await service.waitTask(taskId, 45), undefined);
    const result = await call("wait_task", { task_id: taskId });
    assert.deepEqual(result, { isError: true, body: { error: "UNKNOWN_TASK" } });
    assert.deepEqual(result, await call("task_result", { task_id: taskId }));
  }
});

test("wait_task rejects a pre-aborted signal without reading the task", async (t) => {
  const { service } = await harness(t);
  const controller = new AbortController();
  const reason = new Error("cancelled");
  controller.abort(reason);
  const read = t.mock.method(service, "taskView");
  await assert.rejects(service.waitTask("unknown", 25, controller.signal), (error) => error === reason);
  assert.equal(read.mock.callCount(), 0);
});

test("MCP cancellation aborts the server wait without interrupting execution", { timeout: 5000 }, async (t) => {
  const { service, client, pending, call, interrupts } = await harness(t);
  const { taskId } = service.startTask({ workspace_id: "known", instruction: "inspect" });
  await Promise.resolve();
  const started = deferred<AbortSignal>();
  const stopped = deferred<unknown>();
  const waitTask = service.waitTask.bind(service);
  t.mock.method(service, "waitTask", async (
    id: unknown, seconds: number, signal?: AbortSignal
  ) => {
    assert.ok(signal);
    started.resolve(signal);
    try {
      return await waitTask(id, seconds, signal);
    } catch (error) {
      stopped.resolve(error);
      throw error;
    }
  });
  const controller = new AbortController();
  const request = client.callTool({
    name: "wait_task",
    arguments: { task_id: taskId, timeout_seconds: 45 }
  }, undefined, { signal: controller.signal });
  const rejected = assert.rejects(request);
  const serverSignal = await started.promise;
  assert.equal(serverSignal.aborted, false);
  controller.abort();
  await rejected;
  const error = await stopped.promise;
  assert.equal(serverSignal.aborted, true);
  assert.ok(error instanceof Error);
  assert.equal(error.name, "AbortError");
  assert.equal(interrupts(), 0);
  assert.equal(service.taskView(taskId)?.state, "running");
  pending.resolve({ kind: "completed", output: "still completed" });
  const result = await call("wait_task", { task_id: taskId, timeout_seconds: 1 });
  assert.equal(result.body.ready, true);
  assert.equal(result.body.review_output, "still completed");
});

test("wait_task observes completion of legacy proposal tasks", { timeout: 5000 }, async (t) => {
  const { service, pending, call } = await harness(t);
  const { taskId } = service.runTask({ workspace_id: "known", instruction: "generate" });
  const waiting = service.waitTask(taskId, 45);
  pending.resolve({ kind: "completed", output: "proposal" });
  assert.equal((await waiting)?.output, "proposal");
  const result = await call("wait_task", { task_id: taskId });
  assert.equal(result.body.state, "completed");
  assert.deepEqual(result, await call("task_result", { task_id: taskId }));
});
