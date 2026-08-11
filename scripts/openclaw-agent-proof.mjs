import { execFileSync } from "node:child_process";

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : null;
}

const repo = arg("repo");
const issue = arg("issue");
if (!repo || !issue) throw new Error("Usage: node scripts/openclaw-agent-proof.mjs --repo owner/repo --issue N");

const nonce = `ORCH_AGENT_PROOF_${Date.now()}`;
const message = [
  "This is a bounded orchestration transport proof.",
  `Reply with exactly this token and nothing else: ${nonce}`,
  "Do not use tools, modify files, access credentials, send messages, or perform any external action."
].join(" ");

let raw;
try {
  raw = execFileSync("openclaw", [
    "agent",
    "--message", message,
    "--json",
    "--thinking", "minimal",
    "--timeout", "90"
  ], {
    encoding: "utf8",
    timeout: 120000,
    stdio: ["ignore", "pipe", "pipe"]
  });
} catch (error) {
  const stderr = typeof error?.stderr === "string" ? error.stderr : "";
  const safe = stderr.replace(/(token|password|secret)\s*[:=]\s*\S+/gi, "$1=[REDACTED]");
  const body = `## OpenClaw agent transport proof\n\nSTATUS: FAILED\n\nExpected nonce: \`${nonce}\`\n\nError code: \`${error?.code ?? "UNKNOWN"}\`\n\n\`\`\`text\n${safe.slice(0, 6000)}\n\`\`\``;
  execFileSync("gh", ["issue", "comment", String(issue), "--repo", repo, "--body", body], { stdio: "ignore" });
  process.exit(1);
}

let parsed = null;
try { parsed = JSON.parse(raw); } catch {}
const text = parsed ? JSON.stringify(parsed) : raw;
const success = text.includes(nonce);
const safeText = text.replace(/(token|password|secret)\s*[:=]\s*\S+/gi, "$1=[REDACTED]");
const body = [
  "## OpenClaw agent transport proof",
  "",
  `STATUS: ${success ? "PASSED" : "FAILED_NONCE_MISSING"}`,
  "",
  `Expected nonce: \`${nonce}\``,
  "",
  "```text",
  safeText.slice(0, 8000),
  "```"
].join("\n");
execFileSync("gh", ["issue", "comment", String(issue), "--repo", repo, "--body", body], { stdio: "ignore" });
if (!success) process.exit(2);
