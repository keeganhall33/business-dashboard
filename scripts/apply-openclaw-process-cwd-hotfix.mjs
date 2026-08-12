import fs from "node:fs";
import { execFileSync } from "node:child_process";

const repo = "keeganhall33/business-dashboard";
const branch = "fix/openclaw-process-cwd-v2";

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    encoding: "utf8",
    stdio: options.stdio ?? "pipe",
    timeout: options.timeout ?? 120_000,
    ...options
  });
}

function replaceExact(path, from, to) {
  const before = fs.readFileSync(path, "utf8");
  if (!before.includes(from)) throw new Error(`Expected text not found in ${path}`);
  const after = before.replace(from, to);
  fs.writeFileSync(path, after);
}

const dirty = run("git", ["status", "--porcelain"]).trim();
if (dirty) throw new Error(`Refusing to patch dirty worktree:\n${dirty}`);

run("git", ["pull", "--ff-only", "origin", "main"], { stdio: "inherit" });
try {
  run("git", ["switch", "-c", branch], { stdio: "inherit" });
} catch {
  run("git", ["switch", branch], { stdio: "inherit" });
  run("git", ["reset", "--hard", "origin/main"], { stdio: "inherit" });
}

replaceExact(
  "scripts/orchestration-run-issue-openclaw.mjs",
  '    "--message", prompt,\n    "--cwd", process.cwd(),\n    "--json",',
  '    "--message", prompt,\n    "--json",'
);
replaceExact(
  "scripts/orchestration-run-issue-openclaw.mjs",
  '    encoding: "utf8",\n    timeout: (timeoutSeconds + 60) * 1000,',
  '    encoding: "utf8",\n    cwd: process.cwd(),\n    timeout: (timeoutSeconds + 60) * 1000,'
);

replaceExact(
  "scripts/run-orchestration-issue-agent.mjs",
  '    "--message", prompt,\n    "--cwd", process.cwd(),\n    "--json",',
  '    "--message", prompt,\n    "--json",'
);
replaceExact(
  "scripts/run-orchestration-issue-agent.mjs",
  '    encoding: "utf8",\n    timeout: 960000,',
  '    encoding: "utf8",\n    cwd: process.cwd(),\n    timeout: 960000,'
);

replaceExact(
  "test/orchestration-openclaw-headless.test.tsx",
  '  assert.match(adapter, /"--cwd", process\\.cwd\\(\\)/);',
  '  assert.doesNotMatch(adapter, /"--cwd"/);\n  assert.match(adapter, /cwd: process\\.cwd\\(\\)/);'
);
replaceExact(
  "test/orchestration-openclaw-headless.test.tsx",
  '  assert.doesNotMatch(bootstrap, /"--message-file"/);',
  '  assert.doesNotMatch(bootstrap, /"--message-file"/);\n  assert.doesNotMatch(bootstrap, /"--cwd"/);\n  assert.match(bootstrap, /cwd: process\\.cwd\\(\\)/);'
);

run("git", ["diff", "--check"], { stdio: "inherit" });
run("npm", ["test"], { stdio: "inherit", timeout: 900_000 });
run("git", ["add", "scripts/orchestration-run-issue-openclaw.mjs", "scripts/run-orchestration-issue-agent.mjs", "test/orchestration-openclaw-headless.test.tsx"], { stdio: "inherit" });
run("git", ["commit", "-m", "Fix OpenClaw headless process working directory"], { stdio: "inherit" });
run("git", ["push", "-u", "origin", branch], { stdio: "inherit", timeout: 180_000 });

const prUrl = run("gh", [
  "pr", "create",
  "--repo", repo,
  "--base", "main",
  "--head", branch,
  "--title", "Fix OpenClaw headless process cwd compatibility",
  "--body", "Moves repository cwd from unsupported OpenClaw --cwd CLI argv to Node child_process cwd. Preserves isolated agent exec, direct --message, detached watcher behavior, timeout margin, and orchestration gates. npm test + git diff --check run before PR creation."
]).trim();

console.log(`OPENCLAW_PROCESS_CWD_HOTFIX_PR=${prUrl}`);
