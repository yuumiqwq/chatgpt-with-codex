# Current fork behavior

Version 1.7 provides durable work, native ephemeral execution, project discovery and caller-managed retention. All project changes use the model executor; the previous controlled-patch branch and public workspace-write mode have been removed. Full access is default, with explicit read-only execution available.

See [tools](tools.md), [work management](work-management.md) and [release notes](../RELEASE_NOTES.md). Historical implementation notes are available in Git history.

Validation for 1.7.0-local.1: build and typecheck pass. The installed-launcher audit exposes 24 tools, excludes all ten retired APIs and accepts only read-only/full-access inputs. Real native execution verifies ephemeral history behavior, writable continuation across a Bridge restart using the same UUID, and the archive/adopt/delete lifecycle. The Windows unit suite reports 202 tests: 182 pass, 19 fail and 1 skipped. Every remaining failing test name also failed before this change; the suite is not fully passing on this host.
