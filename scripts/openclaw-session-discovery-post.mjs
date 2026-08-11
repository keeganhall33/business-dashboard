import { execFileSync } from "node:child_process";

function argValue(name) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] : null;
}

const repo = argValue("--repo");
const issue = argValue("--issue");
if (!repo || !issue) {
  console.error("Usage: node scripts/openclaw-session-discovery-post.mjs --repo owner/repo --issue N");
  process.exit(2);
}

try {
  const out = execFileSync("openclaw", ["sessions", "--all-agents", "--json"], {
    encoding: "utf8",
    timeout: 15000,
    stdio: ["ignore", "pipe", "pipe"]
  });
  const parsed = JSON.parse(out);
  const sessions = Array.isArray(parsed) ? parsed : Array.isArray(parsed.sessions) ? parsed.sessions : [];
  const candidates = sessions.slice(0, 20).map((s) => ({
    session_id: s.session_id ?? s.sessionId ?? s.id ?? null,
    session_key: s.session_key ?? s.sessionKey ?? s.key ?? null,
    agent_id: s.agent_id ?? s.agentId ?? s.agent ?? null,
    label: s.label ?? s.session_label ?? s.sessionLabel ?? null,
    updated_at: s.updated_at ?? s.updatedAt ?? null
  }));
  const body = `## OpenClaw valid target candidates\n\n\`\`\`json\n${JSON.stringify({ count: sessions.length, candidates }, null, 2)}\n\`\`\``;
  execFileSync("gh", ["issue", "comment", String(issue), "--repo", repo, "--body", body], { stdio: "inherit", timeout: 15000 });
} catch (error) {
  const stderr = typeof error?.stderr === "string" ? error.stderr : "";
  const safe = (stderr || String(error?.message ?? error)).slice(0, 2000);
  const body = `## OpenClaw valid target candidates\n\nSTATUS: FAILED\n\n\`\`\`text\n${safe}\n\`\`\``;
  try {
    execFileSync("gh", ["issue", "comment", String(issue), "--repo", repo, "--body", body], { stdio: "inherit", timeout: 15000 });
  } catch {}
  process.exitCode = 1;
}
