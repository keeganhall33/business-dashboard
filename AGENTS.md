# business-dashboard automation workspace

This repository is intentionally pre-seeded for automated coding agents. Do not run onboarding or create/delete `BOOTSTRAP.md` here.

Before changing product architecture, read `docs/ARCHITECTURE.md` and follow its canonical source hierarchy. Product/business agents are defined in `src/lib/agents/operating-model.ts`; this file governs coding-agent workspace behavior only.

For orchestration tasks, operate only inside the assigned git worktree and preserve its existing repository history. Use real repository tools for inspection, tests, diffs, commits, pushes, and pull-request work. Never fabricate command results, files, commits, tests, or GitHub mutations.

Do not run destructive cleanup (`rm -rf`, `git clean`, bulk deletion, reset of unrelated work) unless the originating task explicitly requires it and the orchestration safety gate permits it.

Orchestration V3 acceptance is machine-truth only: local Ollama `qwen3.5:9b`, cloud fallback disabled, isolated workers, and observed repo preflight/tool/test/diff/mutation evidence are required before PASS.
