# Host operations

Optional host tools read the private .host-policy.json beside the workspace configuration. host_capabilities reports active settings. When enabled, file tools list/read/write/copy/move/delete within configured roots; replacement and deletion use current content hashes. run_host_command invokes an absolute executable with argv and a working directory, without an implicit shell or visible window. The starting-directory policy is not a process sandbox.

list_codex_projects groups a bounded native history page by cwd; list_codex_threads lists titles and native UUIDs. These metadata queries do not execute a model. open_work adopts an identified UUID and continue_work resumes it. A user may read the task in another client; simultaneous model execution cannot reliably be detected across clients.

reload_workspace_config validates the file and updates the registry when no executions are pending. Changes to the separate host policy require a runtime restart. Legacy allow_write fields in workspace configuration remain readable as metadata and are not execution permission controls; select read-only or danger-full-access through the work tools.

The current tool list and inputs are in [tools](tools.md). No public host tool takes a literal APPLY, EXECUTE or other confirmation token. OS permissions and file consistency checks still apply.
