# Orchestration V3 activation doctor race

The V3 watcher can start a worker immediately after LaunchAgent activation. A legitimate in-progress worker may dirty its protected git worktree before the post-cutover doctor runs. The doctor must therefore distinguish active worker mutation from idle-worktree contamination.

Only `TRACKED_WORKTREE_DIRTY` and `UNEXPECTED_UNTRACKED_FILES` are tolerated for the worker whose stream currently has an `orch:running` issue. Structural failures such as a missing worktree, root mismatch, git preflight failure, or mass tracked deletion remain fatal even while a worker is active.
