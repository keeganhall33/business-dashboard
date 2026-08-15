import { execFileSync } from "node:child_process";

const repo = "keeganhall33/business-dashboard";
const branch = "fix/orch-agent-exec-ephemeral";
const path = "scripts/orchestration-run-issue-openclaw.mjs";

function gh(args) {
  return execFileSync("gh", args, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }).trim();
}

const raw = JSON.parse(gh(["api", `repos/${repo}/contents/${path}?ref=${branch}`]));
let source = Buffer.from(raw.content, "base64").toString("utf8");

const cloudLine = '  const ORCH_CLOUD_AGENT_ID = String(process.env.ORCH_CLOUD_AGENT_ID ?? agent);';
if (!source.includes('ORCH_LOCAL_MODEL')) {
  if (!source.includes(cloudLine)) throw new Error("cloud agent declaration anchor missing");
  source = source.replace(
    cloudLine,
    `${cloudLine}\n  // Ephemeral local orchestration uses an explicit Ollama model, never a persistent OpenClaw agent session.\n  const ORCH_LOCAL_MODEL = String(process.env.ORCH_LOCAL_MODEL ?? "ollama/mistral:latest").trim();`
  );
}

const start = source.indexOf("function runOpenclawWithPrompt(agentId, message) {");
const end = source.indexOf("function tryParseStructured(envelope) {", start);
if (start < 0 || end < 0) throw new Error("runOpenclawWithPrompt block anchors missing");

const replacement = `function runOpenclawWithPrompt(agentId, message) {
  const useEphemeralLocal = String(agentId).startsWith("local-") || agentId === "local";
  const proofOpts = { isProof337: isProof337Run, proofNonce: proofNonceRun };
  const messageWithGuard = useEphemeralLocal
    ? applyProofGuardForLocalStrictJson(message, proofOpts)
    : String(message ?? "");
  const effectiveMessage = useEphemeralLocal && shouldEnforceStrictJsonForLocal(messageWithGuard)
    ? buildStrictJsonRetryPrompt(messageWithGuard, proofOpts)
    : String(messageWithGuard ?? "");
  const effectiveTimeout = useEphemeralLocal
    ? Math.max(Number(timeoutSeconds) || 0, 180)
    : Number(timeoutSeconds);

  // Persistent OpenClaw agent sessions can retain canonical transcript locks even when
  // --session-id and OPENCLAW_STATE_DIR are overridden. For orchestration workers, use
  // agent exec instead: OpenClaw owns a fresh temporary state directory and cleanup for
  // every run. Worker identity remains scheduler-owned (local-a/b/c/d), while the model
  // is explicitly Ollama and no fallback is supplied on this local path.
  const args = useEphemeralLocal
    ? [
        "agent",
        "exec",
        effectiveMessage,
        "--cwd",
        process.cwd(),
        "--model",
        ORCH_LOCAL_MODEL,
        "--code-mode",
        "code",
        "--local-model-lean",
        "--json",
        "--thinking",
        thinking,
        "--timeout",
        String(effectiveTimeout)
      ]
    : [
        "agent",
        "--agent",
        agentId,
        "--message",
        effectiveMessage,
        "--json",
        "--thinking",
        thinking,
        "--timeout",
        String(effectiveTimeout)
      ];

  const res = spawnSync("/opt/homebrew/bin/openclaw", args, {
    encoding: "utf8",
    timeout: (effectiveTimeout + 60) * 1000,
    maxBuffer: 16 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"]
  });
  if (res.error) throw res.error;
  if (res.status !== 0) {
    const err = new Error(`openclaw exited with code ${res.status}`);
    err.stdout = res.stdout;
    err.stderr = res.stderr;
    throw err;
  }
  return extractOpenclawJson(res.stdout, res.stderr);
}

`;

source = source.slice(0, start) + replacement + source.slice(end);

if (!source.includes('"exec"') || !source.includes("ORCH_LOCAL_MODEL")) {
  throw new Error("ephemeral local replacement verification failed");
}
if (source.includes('...(useEmbeddedLocal ? ["--local"] : [])')) {
  throw new Error("legacy persistent --local path still present in local runner block");
}

const encoded = Buffer.from(source, "utf8").toString("base64");
const update = JSON.parse(gh([
  "api",
  "--method", "PUT",
  `repos/${repo}/contents/${path}`,
  "-f", `message=Use ephemeral OpenClaw agent exec for Ollama workers`,
  "-f", `content=${encoded}`,
  "-f", `sha=${raw.sha}`,
  "-f", `branch=${branch}`
]));

console.log(JSON.stringify({ status: "PASS", commit: update.commit.sha, branch }));
