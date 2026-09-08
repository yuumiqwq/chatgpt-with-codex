# Execution and host access

Version 1.7 defaults Codex work to danger-full-access with approvalPolicy never. Model tool operations use the current OS account's filesystem and network privileges; this grants no administrator elevation. Choosing read-only uses the native readOnly sandbox with network disabled. DSH is pinned to its read-only headless mode. Sandbox settings apply to executor tool operations, not to Bridge's own result/log persistence.

There is no workspace-write input, mandatory review/accept step or controlled-patch engine. Instructions explain use and consequences; Bridge does not classify natural-language goals or enforce immutable formal/auxiliary categories. Successful process execution does not prove goal completion: finish_work records the caller's decision.

Optional host file tools retain configured roots, size bounds and SHA-256 replacement checks. Enabled host commands are not OS-sandboxed by their starting directory. Their maximum duration is 45 seconds and output is bounded. File policies do not restrict a separate full-access model execution.

Codex execution retains a 15-minute deadline, two-minute active-turn inactivity watchdog and 30-second RPC bounds. Cancellation of wait_task leaves execution running; control_task interrupt stops execution without undoing edits. Registry writes use short file locks and merge changed records; this does not lock the native history against execution by another client.

Archive preserves history. Native delete_history deletes the selected thread and its spawned descendants, while retaining the registered work's summary and UUID lineage. Age-based native deletion defaults to disabled. Local registry/results are private state and should not be committed to a public repository. Authentication remains in the executor's local profile.
