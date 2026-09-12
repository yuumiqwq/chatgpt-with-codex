# Current MCP tools

Version 1.7 replaces one-conversation-per-call execution with durable work and native ephemeral turns. See [work management](work-management.md) for lifecycle, default full access and retention semantics.

| Tool | Inputs / purpose |
| --- | --- |
| list_work | query, workspace_id/cwd, status, archived, offset/limit; find durable work IDs. |
| open_work | work_id, thread_id, or workspace_id/cwd + name; create, reopen or adopt. Optional access. |
| continue_work | work_id + instruction; optional model, reasoning_effort, access. |
| run_temp | work_id/workspace_id/cwd + instruction; optional executor codex/dsh and access read-only/danger-full-access. model and reasoning_effort are Codex-only. |
| finish_work | work_id + summary; optional references. Caller-declared goal completion. |
| manage_work | work_id + archive/unarchive/delete_history/forget. Native deletion includes descendants. |
| work_retention | Optional result count/age and archive/delete age rules; optional sweep. |
| task_result | task_id; retrieve result, error and bounded execution evidence. |
| wait_task | task_id, timeout_seconds 1–45, default 25; cancellation does not stop execution. |
| control_task | task_id, action steer/interrupt; steering also takes instruction. |
| list_workspaces | Optional query; discover registered project roots and IDs. |
| bind_project | project_path; register an existing project. |
| create_project | parent + name; create an empty Git project and register it. |
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

There are 24 tools with optional host operations enabled, 14 without them. `list_workspaces`, `bind_project` and `create_project` return project identity fields without permission metadata. Host files retain their configured roots and content hash checks; enabled host commands and full-access Codex or DSH executions use OS account privileges.

Access accepts read-only or danger-full-access for Codex and DSH, with full access the default. run_temp applies its own per-call access selection even when associated with a work_id; omitting access does not inherit that work's stored mode. continue_work uses the stored work access unless overridden. Old work records are normalized during load while historical result records retain the access that was used. See [security behavior](security.md) for each executor's permission mechanism.

New successful executions return state completed, ready true and output. Failures expose structured errors; interrupted runs may expose genuine partial_output. Persistent runs carry thread_id; temporary and DSH runs do not. Executors retain the 15-minute deadline; Codex has a two-minute active-turn inactivity watchdog and 30-second RPC deadlines. Timeout of wait_task leaves execution running, so callers continue waiting when ready is false.
