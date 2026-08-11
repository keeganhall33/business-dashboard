# Next Autonomous Orchestration Gate

The immediate gate is a targeted natural-language OpenClaw agent proof using an actually discovered agent/session identifier. The proof must be bounded, non-delivering, and side-effect free.

Pass condition:
- watcher claims task automatically;
- local repo fast-forwards;
- helper discovers valid target from `openclaw sessions --all-agents --json`;
- helper invokes `openclaw agent` against that target with a nonce-only prompt;
- exact nonce is returned;
- result is posted to GitHub;
- watcher remains healthy;
- no Keegan action required.

After pass:
1. implement task-body natural-language adapter;
2. resume micro-slice/review gate work;
3. activate 3 isolated workers;
4. restart parallel Core Intelligence, Discovery Intelligence, and Intelligence UX / Production Value work.
