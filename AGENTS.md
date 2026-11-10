## Safety: destructive actions

Never run a destructive or system-wide command without first reporting:

1. the exact command,
2. what it affects (paths, apps, users, scope),
3. how to undo it.

Wait for explicit approval before running it.

This includes `rm`/`rmdir`, `git reset`/`clean`/forced checkouts,
overwriting config or system files, killing processes, changing
permissions on system paths, and tools such as `sfltool`, `launchctl`,
`tmutil`, and `diskutil`.

Use the narrowest tool for the job. If the narrow path is blocked, stop
and report — never escalate to a broad reset.
