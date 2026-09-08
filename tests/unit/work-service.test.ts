import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { WorkService } from "../../src/tasks/work-service.js";
import { RegisteredWorkspaceRegistry } from "../../src/workspaces/registered-workspace-registry.js";
import { HostPolicy } from "../../src/host/host-policy.js";
import type { ExecutorFactory } from "../../src/tasks/registered-workspace-task-service.js";
import type { ExecutorRequest, ExecutorResult } from "../../src/executors/executor.js";

async function fixture(t: { after(fn: () => void): void }, execute?: (r: ExecutorRequest) => Promise<ExecutorResult>) {
  const root = mkdtempSync(join(tmpdir(), "bridge-work-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const policy = await HostPolicy.create({ version: 1, enabled: true, read_roots: [root],
    write_roots: [root], codex_homes: [root] }, join(root, "policy.json"));
  const registry = new RegisteredWorkspaceRegistry([{ id: "project", root, allow_write: true }]);
  const requests: ExecutorRequest[] = [];
  const nativeCalls: string[] = [];
  const factory: ExecutorFactory = () => ({ execute: async request => {
    requests.push(request);
    if (execute) return execute(request);
    const threadId = request.threadId ?? randomUUID();
    request.onThreadId?.(threadId);
    return { kind: "completed", output: "result:" + request.instruction, threadId };
  }});
  const path = join(root, "work.json");
  const create = () => new WorkService(path, registry, factory, policy, async (_home, method) => {
    nativeCalls.push(method); return {};
  }, async (_policy, threadId) => ({ threadId, cwd: root, codexHome: root, rolloutPath: join(root, threadId + ".jsonl") }));
  const service = create();
  return { root, path, requests, nativeCalls, service, create };
}

test("lazy work creation, project lookup and paginated duplicate names", async t => {
  const f = await fixture(t);
  const a = await f.service.open({ workspace_id: "project", name: "same" });
  const b = await f.service.open({ workspace_id: "project", name: "same" });
  assert.notEqual(a.work_id, b.work_id);
  assert.equal(f.requests.length, 0);
  assert.equal(a.thread_id, undefined);
  const page = f.service.list({ workspace_id: "project", query: "SAME", limit: 1 });
  assert.equal(page.total, 2); assert.equal(page.next_offset, 1);
  assert.equal(f.service.list({ offset: 1, limit: 1 }).works.length, 1);
});

test("native UUID and write access survive restart; semantic completion is separate", async t => {
  const f = await fixture(t);
  const work = await f.service.open({ workspace_id: "project", name: "persist" });
  const first = await f.service.continue(work.work_id, { instruction: "one" });
  const a = await f.service.waitTask(first.task_id);
  assert.equal(a?.state, "completed");
  assert.equal(f.service.list().works[0]?.status, "active");
  f.service.finish(work.work_id, "done", ["commit:abc"]);
  const restored = f.create(); restored.load();
  assert.equal(restored.taskView(first.task_id)?.output, "result:one");
  await restored.open({ work_id: work.work_id });
  const second = await restored.continue(work.work_id, { instruction: "two" });
  const b = await restored.waitTask(second.task_id);
  assert.equal(b?.threadId, a?.threadId);
  assert.equal(f.requests[1]?.sandbox, "danger-full-access");
  assert.equal(f.requests[1]?.threadId, a?.threadId);
});

test("adoption is idempotent and conflicting selectors fail", async t => {
  const f = await fixture(t); const thread = randomUUID();
  const [a,b] = await Promise.all([f.service.open({ thread_id: thread }), f.service.open({ thread_id: thread })]);
  assert.equal(a.work_id,b.work_id);
  assert.equal(f.service.list().total,1);
  await assert.rejects(f.service.open({work_id:a.work_id,thread_id:randomUUID()}),{code:"WORK_ID_CONFLICT"});
});

test("temporary execution persists only its result, never replaces parent history", async t => {
  const f = await fixture(t);
  const work = await f.service.open({thread_id:randomUUID()});
  const run = await f.service.temp({work_id:work.work_id,instruction:"draft patch"});
  await f.service.waitTask(run.task_id);
  assert.equal(f.requests[0]?.ephemeral,true);
  assert.equal(f.requests[0]?.threadId,undefined);
  assert.equal(f.service.taskView(run.task_id)?.threadId,undefined);
  assert.equal(f.service.list().works[0]?.thread_id,work.thread_id);
  assert.equal(JSON.parse(readFileSync(f.path,"utf8")).runs[0].thread_id,undefined);
});

test("own overlapping turns and finish while running are rejected; wait abort does not stop execution", async t => {
  let complete!: (r: ExecutorResult) => void;
  const f = await fixture(t, () => new Promise(resolve => { complete = resolve; }));
  const work = await f.service.open({ workspace_id:"project" });
  const run = await f.service.continue(work.work_id,{instruction:"wait"});
  await assert.rejects(f.service.continue(work.work_id,{instruction:"duplicate"}),{code:"WORK_BUSY"});
  assert.throws(()=>f.service.finish(work.work_id,"done"),{code:"WORK_BUSY"});
  const controller = new AbortController(); controller.abort();
  await assert.rejects(f.service.waitTask(run.task_id,1,controller.signal),{name:"AbortError"});
  assert.equal(f.service.hasPendingTasks(),true);
  complete({kind:"completed",output:"done"});
  assert.equal((await f.service.waitTask(run.task_id))?.state,"completed");
});

test("restart marks an unfinished execution interrupted without inventing recovery", async t => {
  const f = await fixture(t);
  const work = await f.service.open({workspace_id:"project"});
  const data=JSON.parse(readFileSync(f.path,"utf8"));
  const taskId=randomUUID();
  data.runs=[{task_id:taskId,work_id:work.work_id,ephemeral:false,executor:"codex",state:"running",
    access:"workspace-write",created_at:new Date().toISOString(),updated_at:new Date().toISOString()}];
  writeFileSync(f.path,JSON.stringify(data));
  const restored=f.create();restored.load();
  assert.equal(restored.hasPendingTasks(),false);
  assert.equal(restored.taskView(taskId)?.error?.code,"TASK_INTERRUPTED");
});

test("archive/reopen keeps UUID; deleting history keeps lineage and recreates with summary", async t => {
  const f=await fixture(t);
  const work=await f.service.open({thread_id:randomUUID(),name:"work"});
  f.service.finish(work.work_id,"Remember outcome",["proof.txt"]);
  await f.service.manage(work.work_id,"archive");
  await f.service.open({work_id:work.work_id});
  assert.deepEqual(f.nativeCalls,["thread/archive","thread/unarchive"]);
  await f.service.manage(work.work_id,"delete_history");
  const before=f.service.list().works[0]!;
  assert.equal(before.thread_id,undefined);assert.deepEqual(before.previous_threads,[work.thread_id]);
  const run=await f.service.continue(work.work_id,{instruction:"again"});
  await f.service.waitTask(run.task_id);
  assert.notEqual(f.service.taskView(run.task_id)?.threadId,work.thread_id);
  assert.match(f.requests[0]!.instruction,/Remember outcome/);
  assert.match(f.requests[0]!.instruction,/proof.txt/);
});

test("failed native management leaves registered history unchanged",async t=>{
  const f=await fixture(t);
  const work=await f.service.open({thread_id:randomUUID()});
  const policy=await HostPolicy.create({version:1},join(f.root,"other-policy"));
  const broken=new WorkService(f.path,new RegisteredWorkspaceRegistry([]),()=>{throw Error();},policy,async()=>{throw Error("rpc failed");});
  broken.load();
  await assert.rejects(broken.manage(work.work_id,"delete_history"));
  assert.equal(broken.list().works[0]?.thread_id,work.thread_id);
});

test("bounded result retention prunes results across restart but keeps work summaries",async t=>{
  const f=await fixture(t);
  const work=await f.service.open({workspace_id:"project"});
  f.service.configureRetention({max_results:1});
  const a=await f.service.temp({work_id:work.work_id,instruction:"a"});await f.service.waitTask(a.task_id);
  const b=await f.service.temp({work_id:work.work_id,instruction:"b"});await f.service.waitTask(b.task_id);
  f.service.finish(work.work_id,"long lived");
  const restored=f.create();restored.load();
  assert.equal(restored.taskView(a.task_id),undefined);
  assert.equal(restored.taskView(b.task_id)?.output,"result:b");
  assert.equal(readdirSync(restored.resultDirectory).length,1);
  assert.equal(restored.list().works[0]?.summary,"long lived");
});

test("retention defaults do not delete history and configured age rules apply without purpose categories",async t=>{
  const f=await fixture(t);
  const work=await f.service.open({thread_id:randomUUID()});
  f.service.finish(work.work_id,"done");
  const data=JSON.parse(readFileSync(f.path,"utf8"));data.works[0].updated_at="2000-01-01T00:00:00.000Z";
  writeFileSync(f.path,JSON.stringify(data));
  const restored=f.create();restored.load();await restored.sweep();
  assert.equal(f.nativeCalls.length,0);
  restored.configureRetention({archive_completed_days:1});await restored.sweep();
  assert.deepEqual(f.nativeCalls,["thread/archive"]);
  assert.equal(restored.list().works[0]?.archived,true);
});

test("forget preserves native history and rejects corrupted persistence",async t=>{
  const f=await fixture(t);
  const work=await f.service.open({thread_id:randomUUID()});
  await f.service.manage(work.work_id,"forget");
  assert.equal(f.nativeCalls.length,0);assert.equal(f.service.list().total,0);
  writeFileSync(f.path,"invalid");
  assert.throws(()=>f.create().load());
});

test("two Bridge instances preserve each other's work and observe deletion", async t => {
  const f = await fixture(t);
  const other = f.create(); other.load();
  const first = await f.service.open({ workspace_id: "project", name: "first" });
  const second = await other.open({ workspace_id: "project", name: "second" });
  assert.equal(f.service.list().total, 2);
  f.service.finish(first.work_id, "first done");
  other.finish(second.work_id, "second done");
  assert.equal(f.service.list().works.filter(w => w.status === "completed").length, 2);
  await other.manage(second.work_id, "forget");
  await f.service.sweep();
  assert.equal(f.service.list().total, 1);
});

test("another live Bridge owner is not reported interrupted on load", async t => {
  let finish!: (result: ExecutorResult) => void;
  const f = await fixture(t, () => new Promise(resolve => { finish = resolve; }));
  const work = await f.service.open({ workspace_id: "project" });
  const run = await f.service.continue(work.work_id, { instruction: "running" });
  const observer = f.create(); observer.load();
  assert.equal(observer.taskView(run.task_id)?.state, "running");
  finish({ kind: "completed", output: "shared result" });
  await f.service.waitTask(run.task_id);
  assert.equal(observer.taskView(run.task_id)?.output, "shared result");
  assert.equal(observer.hasPendingTasks(), false);
});

test("concurrent archived history adoption keeps one work record", async t => {
  const f = await fixture(t);
  const policy = await HostPolicy.create({ version: 1, codex_homes: [f.root] }, join(f.root, "archive-policy"));
  const service = new WorkService(f.path, new RegisteredWorkspaceRegistry([]),
    () => { throw Error("Adoption must not execute a model"); }, policy,
    async () => { await Promise.resolve(); return {}; },
    async (_policy, threadId) => ({ threadId, cwd: f.root, codexHome: f.root,
      rolloutPath: join(f.root, "archived_sessions", threadId + ".jsonl") }));
  const threadId = randomUUID();
  const [a, b] = await Promise.all([service.open({ thread_id: threadId }), service.open({ thread_id: threadId })]);
  assert.equal(a.work_id, b.work_id);
  assert.equal(service.list().total, 1);
});
