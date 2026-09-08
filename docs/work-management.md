# Durable work and temporary execution

This fork's current interface is version 1.6. The model chooses the work, declares completion and selects retention operations. Bridge records those decisions and executes them; it does not classify natural-language goals or impose permanent “formal/auxiliary” categories.

## Choosing a work

Use `list_work` to find an existing work by project, name or summary. Project names are labels and may repeat; the stored work ID is the identity.

`open_work` handles creation, reopening and native-history adoption:

- Supply `work_id` to reopen the same record, including completed work.
- Supply `thread_id` to adopt a local Codex conversation discovered with `list_codex_projects` / `list_codex_threads`. Repeated adoption returns the same registered work.
- Supply `workspace_id` or an absolute `cwd`, plus `name`, to create a record. No native conversation is created yet.

`continue_work` starts a turn. The first execution creates and names a native thread. Later executions reuse its UUID and original history. Each execution gets a separate Bridge `task_id` for waiting and results. Existing archived history is unarchived when reopened.

Default access is `danger-full-access`, with no additional Codex approval prompt. It permits filesystem, Git-metadata and network operations using the current OS account. The caller can select `workspace-write` or `read-only` for an individual work/turn. Workspace-write can protect Git metadata and disables network; it should not be selected for a requested autonomous commit/push workflow. Stopping an execution does not roll back its edits. DSH remains a read-only, one-shot headless executor.

Bridge checks concurrent execution only within its own process. Reading a conversation in another client is compatible with this flow, but simultaneous execution by another Codex client is not reliably detected.

## Temporary work

`run_temp` accepts a general instruction for any one-off use. An optional `work_id` associates the result with a work, without including or replacing that work's native history. It can inspect a repository, draft a patch, or modify project files according to its access setting.

Codex uses `thread/start` with `ephemeral: true` inside the existing app-server executor. It does not persist a native rollout. This has been tested with the installed native CLI. It still consumes resources while running, and Bridge persists its final result separately. Durable artifacts belong in the project; include artifact paths and commits in the work's summary/references.

Temporary execution has no resumable UUID. Use `continue_work` for ongoing context. A DSH invocation does not produce a fabricated Codex UUID; DSH's own local runtime data is outside native Codex history retention.

For optional controlled patches, ask `run_temp` to return a complete unified Git diff in read-only mode, then pass the result to `submit_controlled_patch`. Refine through another temporary instruction using the earlier diff and requested changes. The retained proposal, validation, apply and commit services remain available, including proposals saved before this upgrade. Their internal generator also uses ephemeral execution if invoked by library consumers.

Removed public APIs: `run_task`, `resume_codex_thread`, `generate_controlled_patch` and `refine_controlled_patch`. There is no duplicate compatibility routing. The public tools no longer require literal confirmation fields such as APPLY or EXECUTE; ordinary parameter and state validation remains.

## Waiting and completion

`wait_task` waits up to 45 seconds per call. A timeout returns current status; when `ready=false`, the caller should issue another wait. Cancelling a wait leaves the execution running. These mechanics do not guarantee that ChatGPT itself will continue making calls after ending its response.

`control_task` offers `steer` and `interrupt`. Successful new executions directly become `completed` and expose `output`; no separate acceptance gate is required. `task_result` also continues to read retained old controlled-patch results.

Execution completion and goal completion are different facts. `finish_work` records the caller's completion decision with a summary and references. `open_work` can subsequently reopen it.

## Persistence and retention

The work registry is `<workspace-config>.work-items.json`. Final run results are separate files in `<workspace-config>.work-items.json.results`. These private state paths should be outside the source checkout.

Work records, summaries and native UUIDs survive restart. A previously running execution becomes interrupted/unmonitored after restart; Bridge does not claim that a process resumed automatically. Inspect outstanding file changes and other clients before continuing.

`manage_work` provides the following operations:

| Action | Effect |
| --- | --- |
| `archive` | Archive native history and hide it from the normal Codex list; retain the work record. |
| `unarchive` | Restore native history to the normal list. |
| `delete_history` | Call native `thread/delete`, deleting that thread **and its spawned descendants**. Retain the work summary, references and previous UUIDs. |
| `forget` | Remove the work registry record only. Native history and retained results remain. |

After history deletion, the next execution creates a new UUID and receives the retained summary/references. It does not recreate the deleted conversation history. When adoption or native history operations fail, the error is reported rather than claiming success.

`work_retention` reads or changes settings and can sweep immediately. An hourly sweep runs while Bridge is running. All age-based native archive/delete rules default to disabled; there is no assumed 30-day deletion policy.

| Setting | Default | Effect |
| --- | --- | --- |
| `max_results` | 100 | Retain at most this many terminal run results. |
| `result_days` | null | Optional age limit for terminal run results. |
| `archive_completed_days` | null | Archive caller-completed work after inactivity. |
| `delete_archived_days` | null | Delete registered archived history after inactivity. |

Use null to disable an age rule. Changing result limits prunes matching results immediately. Native history policies operate only on records currently in this registry, without an immutable purpose restriction. The sweep skips work currently executing in this Bridge. Project artifacts and summaries are unaffected by result pruning. Existing unregistered conversations are not selected automatically.

## Moving an installation

Move the effective configuration and its sidecar state together with the built source. Update project roots, tunnel launchers, Codex's local MCP configuration and scheduled startup actions. Preserve the current tunnel identity and credentials.

Moving workspace directories does not move the Codex profile. Native history indexes contain original paths. Windows directory junctions can preserve these paths, but **sessions and archived_sessions must remain on the same physical volume**: the native archive operation uses rename and fails across drives. Migrating selected date folders alone is therefore unsuitable. `follow_links: true` supports a complete same-volume history layout; canonical destination roots must still match configured file roots.

Move both history trees together after all Codex writers exit, verify every file and preserve their original paths through junctions. Do not replace a live history folder with a stale copied snapshot. Authentication and the live profile database need not move with workspace files. The installed profile's partial history migration was rolled back and verified after a real archive operation exposed the cross-volume limitation; no C-drive space saving from that attempt is claimed.

After replacing public tools, refresh Engineering Bridge in ChatGPT's app/developer connection settings. Existing conversations can retain stale tool metadata; a fresh conversation after refresh loads the new surface. This is distinct from restarting the local runtime.

Official protocol references: [app-server](https://developers.openai.com/codex/app-server/), [ephemeral noninteractive execution](https://developers.openai.com/codex/noninteractive/), [refreshing ChatGPT metadata](https://developers.openai.com/apps-sdk/deploy/connect-chatgpt/#refresh-metadata).
