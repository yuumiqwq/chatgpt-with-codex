# Contributing

Engineering Bridge is a local MCP bridge for durable Codex work, temporary Codex or DSH execution, project discovery and optional host operations. Keep changes focused on the current interfaces in [docs/tools.md](docs/tools.md), and include migration coverage whenever a persisted schema changes.

Workspace configuration defines project identity and registration boundaries. A manual workspace contains `id` and `root`; a `project_root` entry limits paths accepted by `bind_project` and `create_project`. Per-execution write access belongs to `open_work`, `continue_work` and `run_temp`. Bridge file and command operations belong to the adjacent host policy. Do not combine these independent boundaries.

Keep machine-specific paths, credentials, secrets and private runtime sidecars out of source, fixtures, documentation, commits and issue reports. Existing work records and managed workspace IDs must survive compatible migrations.

## Debugging execution

Bridge invokes Codex through `codex app-server --stdio`. For a slow or stalled task, correlate the Bridge `task_id` with the Codex thread or session ID when available, then compare session-start, tool-result, final-message and session-end timestamps. Local session JSONL files and a populated Codex log database can provide evidence, but avoid logging sensitive request bodies or allowing diagnostics to grow without a bound.

Run the standard checks before submitting a change:

```sh
npm ci
npm run typecheck
npm run build
npm test
```

Describe the behavior change, migration path and validation performed. Security-sensitive reports should follow [SECURITY.md](SECURITY.md).
