# Local fork changes

The fork provides cancellable `wait_task` long polling and an optional host
interface. It supports binary file copies, reviewed text replacement,
individual moves/deletes, validated workspace configuration reloads, and native
Codex continuation with selectable read-only or workspace-write turns. Native
resume defaults to workspace-write only in an authorized original cwd; changes
take effect during execution, not when the supervisor accepts the result.
The metadata-only `list_codex_threads` catalog discovers titles, previews and
native UUIDs with search, project filters and pagination. Host commands require a separate opt-in
and run with OS account privileges; file roots are not a command sandbox.
See [host operations](host-operations.md) for settings and limits.

`list_codex_projects` adds project-first navigation: group by original directory,
match project names or paths, then use the returned exact per-project thread-list
arguments. Counts cover the current bounded page, not the entire installation.

This fork adds `list_workspaces` to discover registered project names, IDs,
paths, and controlled-write authorization. Its optional query uses a
case-insensitive substring filter; the calling model interprets natural
language and must clarify ambiguous project choices. It does not scan files.

The Codex app-server JSONL message limit is 1 MiB (1,048,576 UTF-8 bytes),
increased from 64 KiB. This is a per-line wire limit, excluding the newline,
not a maximum file count or a guarantee that all large patches can be applied.
Complete agent text is preserved. Evidence truncation and its 64 KiB aggregate
budget remain unchanged. Oversized or malformed messages still fail closed.
Larger messages consume more memory and parsing time, particularly with
concurrent tasks; prefer small, reviewable migration batches.

The dependency lockfile includes the installation's compatible security fixes.
Machine-specific credentials, workspace paths, and tunnel configuration are
not part of this repository. Keep those in the external installation directory.

`origin` is the user's fork; `upstream` is the author's repository. Fetch
upstream updates and review them on a branch before merging; do not overwrite
these changes with an unreviewed reset. Build with `npm run build` and reconnect
the MCP runtime after updating. Existing ChatGPT connections need a tool refresh
when the tool schema changes.
