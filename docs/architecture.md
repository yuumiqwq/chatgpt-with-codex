# Architecture

The MCP entry point builds a workspace registry, host policy and WorkService. WorkService stores work identity, native UUID, semantic completion and run metadata in a private sidecar; full bounded results live in its adjacent .results directory. Atomic merge writes serialize short registry updates across Bridge processes.

open_work creates or adopts a record without executing a model. continue_work creates the first native thread lazily and subsequently resumes its UUID. run_temp uses native ephemeral thread/start and does not set a persistent thread name or return a resumable native UUID. Both paths use the same executor implementation, with steer and interrupt routed to the live executor.

The Codex executor communicates with codex app-server through JSONL RPC. Read-only and full access are passed to both thread and turn configuration. ExecutorFactory also supports DSH headless execution, always read-only. Public result and waiting interfaces read only WorkService; the previous proposal engine and supervisor service have been removed from source and startup.

Registry state and native history have different lifetimes. Completing a run does not finish a work, forgetting a work does not remove native history, and deleting native history keeps summary/reference records. See [work management](work-management.md) for the transitions and migration constraints.
