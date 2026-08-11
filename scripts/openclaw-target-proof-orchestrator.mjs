import { execFileSync } from "node:child_process";

function argValue(name) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] : null;
}

const repo = argValue("--repo");
const issue = argValue("--issue");
if (!repo || !issue) {
  console.error("Usage: node scripts/openclaw-target-proof-orchestrator.mjs --repo owner/repo --issue N");
  process.exit(2);
}

function post(body) {
  execFileSync("gh", ["issue", "comment", String(issue), "--repo", repo, "--body", body], { stdio: "inherit", timeout: 15000 });
}

try {
  const sessionsOut = execFileSync("openclaw", ["sessions", "--all-agents", "--json"], {
    encoding: "utf8",
    timeout: 15000,
    stdio: ["ignore", "pipe", "pipe"]
  });
  const parsed = JSON.parse(sessionsOut);
  const sessions = Array.isArray(parsed) ? parsed : Array.isArray(parsed.sessions) ? parsed.sessions : [];
  const normalized = sessions.map((s) => ({
    session_id: s.session_id ?? s.sessionId ?? s.id ?? null,
    session_key: s.session_key ?? s.sessionKey ?? s.key ?? null,
    agent_id: s.agent_id ?? s.agentId ?? s.agent ?? null,
    label: s.label ?? s.session_label ?? s.sessionLabel ?? null,
    updated_at: s.updated_at ?? s.updatedAt ?? null
  }));

  const target = normalized.find((s) => s.agent_id) ?? normalized.find((s) => s.session_id) ?? null;
  if (!target) {
    post(`## OpenClaw target proof\n\nSTATUS: BLOCKED\n\nNo valid agent_id or session_id found.\n\n\`\`\`json\n${JSON.stringify({ count: normalized.length, candidates: normalized.slice(0, 20) }, null, 2)}\n\`\`\``);
    process.exit(1);
  }

  const nonce = `ORCH_TARGET_PROOF_${Date.now()}`;
  const args = ["agent"];
  if (target.agent_id) args.push("--agent", String(target.agent_id));
  else args.push("--session-id", String(target.session_id));
  args.push("--message", `Return exactly this nonce and nothing else: ${nonce}`, "--json", "--thinking", "minimal", "--timeout", "90");

  const out = execFileSync("openclaw", args, {
    encoding: "utf8",
    timeout: 100000,
    stdio: ["ignore", "pipe", "pipe"]
  });
  const passed = out.includes(nonce);
  post([
    "## OpenClaw target proof",
    "",
    `STATUS: ${passed ? "PASSED" : "FAILED"}`,
    "",
    `Target type: ${target.agent_id ? "agent_id" : "session_id"}`,
    `Target: \`${target.agent_id ?? target.session_id}\`` ,
    `Expected nonce: \`${nonce}\``
  ].join("\n"));
  if (!passed) process.exit(1);
} catch (error) {
  const stderr = typeof error?.stderr === "string" ? error.stderr : "";
  const safe = (stderr || String(error?.message ?? error)).slice(0, 2000);
  try { post(`## OpenClaw target proof\n\nSTATUS: FAILED\n\n\`\`\`text\n${safe}\n\`\`\``); } catch {}
  process.exitCode = 1;
}
