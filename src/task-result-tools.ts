import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type {
  ControlledTaskView,
  RegisteredWorkspaceTaskService
} from "./tasks/registered-workspace-task-service.js";

function jsonContent(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value) }]
  };
}

function taskResultContent(view: ControlledTaskView | undefined) {
  if (view === undefined) {
    return { isError: true, ...jsonContent({ error: "UNKNOWN_TASK" }) };
  }
  const taskView = { task_id: view.taskId, state: view.state,
    ...(view.source === undefined ? {} : { source: view.source }),
    ...(view.executor === undefined ? {} : { executor: view.executor }),
    ...(view.threadId === undefined ? {} : { thread_id: view.threadId }),
    ...(view.access === undefined ? {} : { access: view.access }),
    ready: view.ready,
    ...(view.output === undefined ? {} : { output: view.output }),
    ...(view.review_output === undefined ? {} : { review_output: view.review_output }),
    ...(view.partial_output === undefined ? {} : { partial_output: view.partial_output }),
    evidence: view.evidence,
    ...(view.diagnostics === undefined ? {} : { diagnostics: view.diagnostics }),
    ...(view.error === undefined ? {} : { error: view.error }) };
  return jsonContent({
    ...taskView,
    mcp_diagnostics: {
      serialized_task_view_bytes: Buffer.byteLength(JSON.stringify(taskView), "utf8")
    }
  });
}

export function registerTaskResultTools(
  server: McpServer,
  service: Pick<RegisteredWorkspaceTaskService, "taskView" | "waitTask">
): void {
  server.registerTool("task_result", {
    description: "Retrieve the completed output or safe error for a task. This tool is read-only.",
    inputSchema: { task_id: z.string() }
  }, ({ task_id }) => taskResultContent(service.taskView(task_id)));

  server.registerTool("wait_task", {
    description: "Wait until a task is ready, including supervisor review, or the timeout expires. Returns the current task view without interrupting the task. This tool is read-only.",
    inputSchema: {
      task_id: z.string(),
      timeout_seconds: z.number().min(1).max(45).optional().default(25)
    },
    annotations: { readOnlyHint: true, destructiveHint: false }
  }, async ({ task_id, timeout_seconds }, { signal }) => {
    const view = await service.waitTask(task_id, timeout_seconds, signal);
    signal.throwIfAborted();
    return taskResultContent(view);
  });
}
