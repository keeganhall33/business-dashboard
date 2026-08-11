import { execFileSync } from "node:child_process";

function argValue(name) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] : null;
}

const repo = argValue("--repo");
const issue = argValue("--issue");
const agent = argValue("--agent");
const sessionId = argValue("--session-id");

if (!repo || !issue || (!agent && !sessionId)) {
  console.error("Usage: node scripts/openclaw-agent-proof-targeted.mjs --repo owner/repo --issue N (--agent ID | --session-id ID)");
  process.exit(2);
}

const nonce = `ORCH_AGENT_TARGET_PROOF_${Date.now()}`;
const prompt = `Return exactly this nonce and nothing else: ${nonce}`;
const args = ["agent"];
if (agent) args.push("--agent", agent);
if (sessionId) args.push("--session-id", sessionId);
args.push("--message", prompt, "--json", "--thinking", "minimal", "--timeout", "90");

try {
  const out = execFileSync("openclaw", args, {
    encoding: "utf8",
    timeout: 100000,
    stdio: ["ignore", "pipe", "pipe"]
  });
  const passed = out.includes(nonce);
  const body = [
    "## OpenClaw targeted agent transport proof",
    "",
    `STATUS: ${passed ? "PASSED" : "FAILED"}`,
    "",
    `Target: ${agent ? `agent=${agent}` : `session-id=${sessionId}`}`,
    "",
    `Expected nonce: \`${nonce}\``
  ].join("\n");
  execFileSync("gh", ["issue", "comment", String(issue), "--repo", repo, "--body", body], { stdio: "inherit", timeout: 15000 });
  if (!passed) process.exitCode = 1;
} catch (error) {
  const stderr = typeof error?.stderr === "string" ? error.stderr : "";
  const safe = stderr.slice(0, 2000);
  const body = [
    "## OpenClaw targeted agent transport proof",
    "",
    "STATUS: FAILED",
    "",
    `Target: ${agent ? `agent=${agent}` : `session-id=${sessionId}`}`,
    "",
    "```text",
    safe || String(error?.message ?? error),
    "```"
  ].join("\n");
  try {
    execFileSync("gh", ["issue", "comment", String(issue), "--repo", repo, "--body", body], { stdio: "inherit", timeout: 15000 });
  } catch {}
  process.exitCode = 1;
}
