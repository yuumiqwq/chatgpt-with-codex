# Engineering Bridge

This fork connects ChatGPT to local Codex and DSH through MCP. Version 1.7 uses durable Codex work for ongoing tasks, with Codex ephemeral execution or DSH headless execution for one-off instructions. It exposes 24 tools with host operations enabled, or 14 without them.

## Changes from upstream

This comparison is against the fork point, upstream v1.4.2 at [`ddabd94`](https://github.com/wudy29/engineering-bridge/commit/ddabd9486c6a997fc73326267487c31ee4788095). It does not describe later upstream development.

| Area | Upstream fork point | This fork |
| --- | --- | --- |
| Continuation | Native context supports supervised continuation; Bridge supervision state may be lost on restart | Persist work IDs, summaries and native UUIDs; unify create/reopen/adopt and resume the same history after restart |
| Editing | A separate proposal and application flow modifies projects | Codex and DSH work directly under per-execution access, with full access by default |
| One-off execution | Task and patch APIs start executions | General run_temp selects Codex native ephemeral execution or DSH one-shot headless execution |
| Discovery | Registered workspace IDs are the principal entry point | Find workspaces and native Codex history by project, then adopt an existing task |
| Completion and retention | Supervision, review and acceptance manage each run | Distinguish run completion from goal completion; retain summaries and expose archive/retention settings |
| Host operations | Registered-project tasks and patches are the main entry points | Optional file/command tools and workspace configuration reload, enabled by local configuration |

This is an incompatible tool-surface change: ten legacy public APIs have been removed. See [fork changes](docs/FORK_CHANGES.md) for the exact migration list, implementation references and validation scope.

## Workflow

Find the project with list_workspaces or list_codex_projects. Use list_work to find an existing registered work, then open_work to create, reopen or adopt a native Codex UUID. continue_work reuses that history and directly edits the project. run_temp executes a general one-off instruction without persisting a native Codex conversation.

Use wait_task repeatedly while ready is false; each call waits at most 45 seconds and cancelling the wait does not stop execution. finish_work records the caller's decision that the goal is complete. manage_work and work_retention control archive and retention. By default Bridge retains 100 terminal execution results and enables no age-based history deletion.

Codex and DSH both accept read-only and danger-full-access. run_temp defaults to danger-full-access for either executor and honors access on each call. Full access permits file changes and commands using the current OS account's privileges. Codex receives native sandbox configuration; DSH receives DSH_PERMISSION_MODE in each child process. See [security behavior](SECURITY.md) for the enforcement boundaries.

A workspace stores project identity, root and source, while project_root entries bound which projects can be registered. Executor write access comes from the access input on open_work, continue_work and run_temp. Bridge file and command tools use the separate host policy. DSH remains a one-shot headless executor without a resumable Codex UUID and does not accept the Codex-only model and reasoning_effort options.

## Run locally

Install Node.js 22 or newer, Git and the selected executor CLI. Authenticate that executor locally. Run npm ci and npm run build, then start node dist/src/mcp-stdio.js with the absolute path to a workspace configuration based on config/workspaces.example.json. Optional host operations use the adjacent .host-policy.json file. Keep private configuration and credentials outside the source checkout.

After installing an updated build, restart Bridge and refresh the connection's metadata in ChatGPT Plugins. Start a new conversation to load the refreshed tools. Pushing source to GitHub does not deploy the local runtime or edit a ChatGPT connection's display description.

## Documentation

- [Current tools](docs/tools.md)
- [Work lifecycle, access and retention](docs/work-management.md)
- [Architecture](docs/architecture.md)
- [Host operations](docs/host-operations.md)
- [Security behavior](SECURITY.md)
- [Release notes](RELEASE_NOTES.md)

The current implementation is a fork of [wudy29/engineering-bridge](https://github.com/wudy29/engineering-bridge). Earlier release descriptions remain in Git history; they do not describe the current tool surface. Run npm test for the suite; the existing Windows suite has known platform-related failures, so consult the recorded validation for each release.

On Windows, Git, DSH, Codex and host command processes started directly by Bridge hide their console windows while returning captured output through tools. Windows opened explicitly by executors are outside this guarantee.
