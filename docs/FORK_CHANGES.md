# Current fork behavior

Version 1.7 provides durable work, temporary execution, project discovery and caller-managed retention. Model-driven changes use the executor directly; optional host tools can also edit files or run commands. The previous controlled-patch branch and public workspace-write mode have been removed. Codex and DSH both support read-only and danger-full-access, with full access the default for temporary execution.

## Comparison baseline

The upstream comparison uses [wudy29/engineering-bridge at ddabd9486c6a997fc73326267487c31ee4788095](https://github.com/wudy29/engineering-bridge/tree/ddabd9486c6a997fc73326267487c31ee4788095), the v1.4.2 fork point. Upstream already supported continuing native context and steering/interruption; this fork adds persistent work identity and lifecycle management around that capability. Later upstream changes are outside this comparison.

## Added or changed behavior

- **Persistent work:** `open_work` combines create/reopen/adopt; `continue_work` reuses native history. Work IDs, summaries and result references survive Bridge restarts. A running process is not automatically resumed after restart. See [work-service.ts](../src/tasks/work-service.ts).
- **Temporary execution:** `run_temp` selects Codex native ephemeral execution or DSH one-shot headless execution for any one-off instruction. Neither returns a resumable native Codex UUID; Bridge retains a bounded result and project artifacts remain. See [codex-executor.ts](../src/executors/codex-executor.ts) and [dsh-executor.ts](../src/executors/dsh-executor.ts).
- **Project discovery:** `list_workspaces` searches registered projects; `list_codex_projects` and `list_codex_threads` browse local native history before adoption. Names need not be unique and project history browsing is paginated. See [host tools](../src/host/host-tools.ts).
- **Direct execution:** new Codex work and temporary Codex or DSH runs default to full account access; `read-only` is selectable for both executors. `run_temp` applies the same per-call access selection and default regardless of executor. DSH receives `DSH_PERMISSION_MODE` in each child process, while Codex keeps its native sandbox configuration. Old stored workspace-write settings normalize to full access, while old run records preserve the access originally used. See [security behavior](security.md) for permission boundaries.
- **Completion and retention:** `finish_work` records the caller's goal-completion decision separately from process exit. `manage_work` controls archive/history deletion/registration removal, and `work_retention` configures cleanup. Defaults retain 100 terminal results with no age-based history deletion. Native deletion also deletes spawned descendants.
- **Host capabilities:** optional host file and command tools, plus validated workspace configuration reload, extend operations beyond registered-project model execution. Host command roots constrain the initial working directory, not all access by the spawned process. Desktop GUI control is not included.
- **Waiting and protocol handling:** `wait_task` waits up to 45 seconds; cancellation of the wait leaves execution running. The Codex JSONL line limit is raised to 1 MiB with UTF-8 boundary coverage. These changes do not guarantee that ChatGPT continues calling tools after it ends a response.

## Removed interfaces and migration

The removed APIs are `run_task`, `resume_codex_thread`, `generate_controlled_patch`, `refine_controlled_patch`, `authorize_workspace_write`, `submit_controlled_patch`, `apply_controlled_patch`, `commit_controlled_patch`, `configure_validation_profile` and `validate_controlled_patch`. The patch, validation and supervisor execution services were deleted.

Use `open_work` / `continue_work` for ongoing context and `run_temp` for one-off work. `control_task` retains steering and interruption; there is no separate acceptance step or literal APPLY/COMMIT token. Git operations run through the authorized executor or enabled host tools. Refresh client tool metadata after installing the changed server.

Legacy private patch/validation files remain historical data; old patch IDs cannot execute through `task_result`. This is an intentional API compatibility break, not a claim that upstream clients can continue using their previous calls unchanged.

## Scope of local installation work

The user's E-drive paths, tunnel credentials, scheduled task and personal-history migration helper belong to the private installation and are not bundled machine settings in this public repository. Moving the source checkout does not by itself move a Codex profile. See [work management](work-management.md) for the required same-volume history layout and migration checks.

See [tools](tools.md), [work management](work-management.md) and [release notes](../RELEASE_NOTES.md). Historical implementation notes are available in Git history.

Validation for 1.7.0-local.1: build and typecheck pass. The installed-launcher audit exposes 24 tools, excludes all ten retired APIs and accepts only read-only/full-access inputs. Real native execution verifies ephemeral history behavior, writable continuation across a Bridge restart using the same UUID, and the archive/adopt/delete lifecycle. The Windows unit suite reports 202 tests: 182 pass, 19 fail and 1 skipped. Every remaining failing test name also failed before this change; the suite is not fully passing on this host.
