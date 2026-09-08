# Current MCP tools

Version 1.6 replaces one-conversation-per-call execution with durable work and native ephemeral turns. See [work management](work-management.md) for lifecycle, default full access and retention semantics.

| Tool | Inputs / purpose |
| --- | --- |
| list_work | query, workspace_id/cwd, status, archived, offset/limit; find durable work IDs. |
| open_work | work_id, thread_id, or workspace_id/cwd + name; create, reopen or adopt. Optional access. |
| continue_work | work_id + instruction; optional model, reasoning_effort, access. |
| run_temp | work_id/workspace_id/cwd + instruction; optional executor, model, reasoning_effort, access. |
| finish_work | work_id + summary; optional references. Caller-declared goal completion. |
| manage_work | work_id + archive/unarchive/delete_history/forget. Native deletion includes descendants. |
| work_retention | Optional result count/age and archive/delete age rules; optional sweep. |
| task_result | task_id; retrieve result, error and bounded execution evidence. |
| wait_task | task_id, timeout_seconds 1–45, default 25; cancellation does not stop execution. |
| control_task | task_id, action steer/interrupt; steering also takes instruction. |
| list_workspaces | Optional query; discover registered project roots and IDs. |
| bind_project | project_path; register an existing project. |
| create_project | parent + name; create an empty Git project and register it. |
| authorize_workspace_write | workspace_id; enable the optional controlled-patch writer for managed workspaces. |
| submit_controlled_patch | workspace_id + base_head + diff; retain a complete unified diff. |
| apply_controlled_patch | patch_task_id; apply a retained patch. Does not stage/commit/push. |
| commit_controlled_patch | patch_task_id + message; commit the already-applied patch. Does not push. |
| configure_validation_profile | workspace_id + profile; persist preparation/validation steps. |
| validate_controlled_patch | patch_task_id; validate using the configured profile. |
| host_capabilities | Current host settings and execution limits. |
| list_codex_projects | Optional query/home/cursor/scan_limit/archived; project groups from a bounded history page. |
| list_codex_threads | Optional query/cwd/home/cursor/limit/archived; native IDs and titles. |
| read_host_file | path; optional offset, max_bytes and utf8/base64 encoding. |
| list_host_path | path; optional offset/limit. |
| write_host_text_file | path + content; expected_sha256 for replacement; optional create_parents. |
| copy_file | source + destination; optional create_parents. |
| move_file | source + destination + expected_sha256; optional create_parents. |
| delete_file | path; expected_sha256 for a file; empty directories also supported. |
| run_host_command | absolute executable + args + cwd; timeout_seconds 1–45. |
| reload_workspace_config | Validate/reload when no executions are pending. |

There are 30 tools with optional host operations enabled, 20 without them. Host files retain their configured roots and content hash checks; enabled host commands and full-access Codex executions use OS account privileges. No public tool requires a literal confirmation token.

Removed tools: run_task, resume_codex_thread, generate_controlled_patch and refine_controlled_patch. Old controlled-patch proposal records remain readable. Their optional internal engine still checks Git base state, patch consistency and configured controlled-write permission. Direct full-access work can edit, test and run Git itself.

New successful executions return state completed, ready true and output. Failures expose structured errors; interrupted runs may expose genuine partial_output. Persistent runs carry thread_id; temporary and DSH runs do not. Executors retain the 15-minute deadline; Codex has a two-minute active-turn inactivity watchdog and 30-second RPC deadlines. Timeout of wait_task leaves execution running, so callers continue waiting when ready is false.
