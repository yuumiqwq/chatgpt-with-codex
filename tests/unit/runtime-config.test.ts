import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_CODEX_EXECUTOR_TIMING,
  DEFAULT_WAIT_TASK_MAX_TIMEOUT_SECONDS,
  codexExecutorTimingFromEnvironment,
  waitTaskMaxTimeoutSeconds
} from "../../src/runtime-config.js";

test("runtime timeout defaults match the long-running Bridge policy", () => {
  assert.equal(DEFAULT_CODEX_EXECUTOR_TIMING.executionTimeoutMs, 60 * 60_000);
  assert.equal(DEFAULT_CODEX_EXECUTOR_TIMING.protocolInactivityTimeoutMs, 5 * 60_000);
  assert.equal(DEFAULT_CODEX_EXECUTOR_TIMING.commandProtocolInactivityTimeoutMs, 15 * 60_000);
  assert.equal(DEFAULT_CODEX_EXECUTOR_TIMING.rpcCallTimeoutMs, 30_000);
  assert.equal(DEFAULT_WAIT_TASK_MAX_TIMEOUT_SECONDS, 300);
  assert.deepEqual(codexExecutorTimingFromEnvironment({}), DEFAULT_CODEX_EXECUTOR_TIMING);
  assert.equal(waitTaskMaxTimeoutSeconds({}), 300);
});

test("runtime timeout environment overrides are parsed independently", () => {
  const timing = codexExecutorTimingFromEnvironment({
    ENGINEERING_BRIDGE_CODEX_EXECUTION_TIMEOUT_SECONDS: "7200",
    ENGINEERING_BRIDGE_CODEX_PROTOCOL_INACTIVITY_TIMEOUT_SECONDS: "420",
    ENGINEERING_BRIDGE_CODEX_COMMAND_INACTIVITY_TIMEOUT_SECONDS: "1200",
    ENGINEERING_BRIDGE_CODEX_RPC_TIMEOUT_SECONDS: "45"
  });
  assert.equal(timing.executionTimeoutMs, 7_200_000);
  assert.equal(timing.protocolInactivityTimeoutMs, 420_000);
  assert.equal(timing.commandProtocolInactivityTimeoutMs, 1_200_000);
  assert.equal(timing.rpcCallTimeoutMs, 45_000);
  assert.equal(waitTaskMaxTimeoutSeconds({ ENGINEERING_BRIDGE_WAIT_TASK_MAX_TIMEOUT_SECONDS: "600" }), 600);
});

test("runtime timeout environment rejects invalid values", () => {
  for (const env of [
    { ENGINEERING_BRIDGE_CODEX_EXECUTION_TIMEOUT_SECONDS: "0" },
    { ENGINEERING_BRIDGE_CODEX_PROTOCOL_INACTIVITY_TIMEOUT_SECONDS: "1.5" },
    { ENGINEERING_BRIDGE_CODEX_COMMAND_INACTIVITY_TIMEOUT_SECONDS: "nope" },
    { ENGINEERING_BRIDGE_CODEX_RPC_TIMEOUT_SECONDS: "601" },
    { ENGINEERING_BRIDGE_WAIT_TASK_MAX_TIMEOUT_SECONDS: "3601" }
  ]) {
    assert.throws(() => {
      codexExecutorTimingFromEnvironment(env);
      waitTaskMaxTimeoutSeconds(env);
    });
  }
});
