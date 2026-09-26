import { DEFAULT_EXECUTOR_TIMING, type ExecutorTiming } from "./executors/executor.js";

const MAX_CODEX_TIMEOUT_SECONDS = 24 * 60 * 60;
const MAX_RPC_TIMEOUT_SECONDS = 10 * 60;
const MAX_WAIT_TASK_TIMEOUT_SECONDS = 60 * 60;

export const DEFAULT_WAIT_TASK_TIMEOUT_SECONDS = 25;
export const DEFAULT_WAIT_TASK_MAX_TIMEOUT_SECONDS = 300;

export const DEFAULT_CODEX_EXECUTOR_TIMING: ExecutorTiming = { ...DEFAULT_EXECUTOR_TIMING };

function configuredSeconds(
  environment: Readonly<NodeJS.ProcessEnv>,
  name: string,
  fallbackSeconds: number,
  maximumSeconds: number
): number {
  const raw = environment[name];
  if (raw === undefined || raw.trim() === "") return fallbackSeconds;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > maximumSeconds) {
    throw new Error(`${name} must be an integer between 1 and ${maximumSeconds} seconds.`);
  }
  return value;
}

export function codexExecutorTimingFromEnvironment(
  environment: Readonly<NodeJS.ProcessEnv> = process.env
): ExecutorTiming {
  return {
    executionTimeoutMs: configuredSeconds(
      environment,
      "ENGINEERING_BRIDGE_CODEX_EXECUTION_TIMEOUT_SECONDS",
      DEFAULT_CODEX_EXECUTOR_TIMING.executionTimeoutMs / 1000,
      MAX_CODEX_TIMEOUT_SECONDS
    ) * 1000,
    interruptGraceMs: DEFAULT_CODEX_EXECUTOR_TIMING.interruptGraceMs,
    killGraceMs: DEFAULT_CODEX_EXECUTOR_TIMING.killGraceMs,
    protocolInactivityTimeoutMs: configuredSeconds(
      environment,
      "ENGINEERING_BRIDGE_CODEX_PROTOCOL_INACTIVITY_TIMEOUT_SECONDS",
      (DEFAULT_CODEX_EXECUTOR_TIMING.protocolInactivityTimeoutMs ?? 0) / 1000,
      MAX_CODEX_TIMEOUT_SECONDS
    ) * 1000,
    commandProtocolInactivityTimeoutMs: configuredSeconds(
      environment,
      "ENGINEERING_BRIDGE_CODEX_COMMAND_INACTIVITY_TIMEOUT_SECONDS",
      (DEFAULT_CODEX_EXECUTOR_TIMING.commandProtocolInactivityTimeoutMs ?? 0) / 1000,
      MAX_CODEX_TIMEOUT_SECONDS
    ) * 1000,
    rpcCallTimeoutMs: configuredSeconds(
      environment,
      "ENGINEERING_BRIDGE_CODEX_RPC_TIMEOUT_SECONDS",
      (DEFAULT_CODEX_EXECUTOR_TIMING.rpcCallTimeoutMs ?? 0) / 1000,
      MAX_RPC_TIMEOUT_SECONDS
    ) * 1000
  };
}

export function waitTaskMaxTimeoutSeconds(
  environment: Readonly<NodeJS.ProcessEnv> = process.env
): number {
  return configuredSeconds(
    environment,
    "ENGINEERING_BRIDGE_WAIT_TASK_MAX_TIMEOUT_SECONDS",
    DEFAULT_WAIT_TASK_MAX_TIMEOUT_SECONDS,
    MAX_WAIT_TASK_TIMEOUT_SECONDS
  );
}
