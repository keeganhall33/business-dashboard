import { execFileSync } from "node:child_process";

function argValue(name) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] : null;
}

const repo = argValue("--repo");
const issue = argValue("--issue");
const args = ["sessions", "--all-agents", "--json"];

try {
  const out = execFileSync("openclaw", args, {
    encoding: "utf8",
    timeout: 15000,
    stdio: ["ignore", "pipe", "pipe"]
  });

  const parsed = JSON.parse(out);
  const sessions = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed.sessions)
      ? parsed.sessions
      : [];

  const compact = sessions.slice(0, 20).map((s) => ({
    session_id: s.session_id ?? s.sessionId ?? s.id ?? s.key ?? null,
    session_key: s.session_key ?? s.sessionKey ?? s.key ?? null,
    agent_id: s.agent_id ?? s.agentId ?? s.agent ?? null,
    label: s.label ?? s.session_label ?? s.sessionLabel ?? null,
    updated_at: s.updated_at ?? s.updatedAt ?? null
  }));

  const body = [
    "## OpenClaw session target discovery",
    "",
    "```json",
    JSON.stringify({ count: sessions.length, candidates: compact }, null, 2),
    "```"
  ].join("\n");

  if (repo && issue) {
    execFileSync("gh", ["issue", "comment", String(issue), "--repo", repo, "--body", body], {
      stdio: "inherit",
      timeout: 15000
    });
  } else {
    console.log(body);
  }
} catch (error) {
  const code = error?.code ?? "UNKNOWN";
  const status = error?.status ?? "UNKNOWN";
  const stderr = typeof error?.stderr === "string" ? error.stderr : "";
  const msg = `FAILED code=${code} status=${status}${stderr ? `\n${stderr}` : ""}`;
  console.error(msg);
  process.exitCode = 1;
}
