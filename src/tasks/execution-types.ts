import type { Id } from "../core/ids.js";
import type { SerializedError } from "../core/errors.js";
import type { Executor, ExecutorDiagnostics, ExecutorEvidence, SandboxMode } from "../executors/executor.js";

export type ExecutorName = "codex" | "dsh";
export type ExecutorFactory = (executor: ExecutorName, workspaceRoot: string, codexHome?: string) => Executor;
export interface TaskView {
  readonly taskId: Id;
  readonly state: "queued" | "running" | "completed" | "failed";
  readonly access?: SandboxMode;
  readonly executor?: ExecutorName;
  readonly threadId?: string;
  readonly ready?: boolean;
  readonly output?: string;
  readonly partial_output?: string;
  readonly evidence?: readonly ExecutorEvidence[];
  readonly diagnostics?: ExecutorDiagnostics;
  readonly error?: SerializedError | undefined;
}
