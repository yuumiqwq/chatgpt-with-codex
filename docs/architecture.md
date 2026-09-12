# Architecture

The MCP entry point builds a workspace registry, host policy and WorkService. WorkService stores work identity, native UUID, semantic completion and run metadata in a private sidecar; full bounded results live in its adjacent .results directory. Atomic merge writes serialize short registry updates across Bridge processes.

open_work creates or adopts a record without executing a model. continue_work creates the first native Codex thread lazily and subsequently resumes its UUID. run_temp selects Codex native ephemeral thread/start or DSH one-shot headless execution; neither returns a resumable native UUID. Execution control is routed to the live executor according to its supported operations.

The Codex executor communicates with codex app-server through JSONL RPC. Read-only and full access are passed to both thread and turn configuration. The DSH executor runs the official headless command and sets DSH_PERMISSION_MODE per invocation from the same access selection. WorkService defaults run_temp to danger-full-access for either executor, records the selected access and forwards it to the selected executor without a DSH-specific override. See [security behavior](security.md) for executor-specific enforcement.

Public result and waiting interfaces read only WorkService; the previous proposal engine and supervisor service have been removed from source and startup. DSH has no fabricated native Codex history, and Codex-only model and reasoning_effort inputs remain unsupported for DSH.

Registry state and native history have different lifetimes. Completing a run does not finish a work, forgetting a work does not remove native history, and deleting native history keeps summary/reference records. See [work management](work-management.md) for the transitions and migration constraints.
