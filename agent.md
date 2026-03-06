# Agent Guidelines

## Worktree Cleanliness

The agent is responsible for keeping the git worktree clean at all times:

- **No orphaned files**: Do not leave untracked files that aren't necessary for the project
- **No dangling changes**: Do not leave uncommitted changes from completed work
- **Clean up artifacts**: Remove any temporary, generated, or scratch files created during development
- **Communicate incomplete work**: If work is in progress and cannot be committed, clearly inform the user about what remains uncommitted and why
- **Stage intentionally**: Only stage files that are directly related to the current task
