import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createObservedExecutionHarness, readObservedExecutionEvidence } from "./execution-evidence.mjs";

const MODEL = "ollama/qwen3.5:9b";

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : fallback;
}

function tail(value, limit = 5000) {
  const text = String(value ?? "");
  return text.length <= limit ? text : text.slice(-limit);
}

function findExecutable(candidates) {
  for (const candidate of candidates) {
    if (candidate.includes("/") && fs.existsSync(candidate)) return candidate;
    const probe = spawnSync("/usr/bin/which", [candidate], { encoding: "utf8", timeout: 5000 });
    if (probe.status === 0 && probe.stdout.trim()) return probe.stdout.trim();
  }
  return null;
}

export function isMainModule(moduleUrl, argvPath) {
  if (!argvPath) return false;
  const modulePath = fileURLToPath(moduleUrl);
  try {
    return fs.realpathSync(modulePath) === fs.realpathSync(argvPath);
  } catch {
    return path.resolve(modulePath) === path.resolve(argvPath);
  }
}

export function parseAgentMeta(stdout) {
  const text = String(stdout ?? "").trim();
  if (!text) return { provider: null, model: null, parseError: null };
  const candidates = [text, ...text.split("\n").reverse().filter(Boolean)];
  for (const candidate of candidates) {
    try {
      const value = JSON.parse(candidate);
      const meta = value?.meta?.agentMeta ?? value?.agentMeta ?? value?.result?.agentMeta ?? null;
      const provider = meta?.provider ?? value?.provider ?? null;
      const model = meta?.model ?? value?.model ?? null;
      if (provider || model) return { provider, model, parseError: null };
    } catch {}
  }
  return { provider: null, model: null, parseError: "NO_AGENT_META_JSON" };
}

export function classifyDiagnostic({ processResult, evidence, agentMeta }) {
  const observedGit = evidence.successfulCommands.some((command) => /^git status --short --branch\b/.test(command));
  const processTimedOut = processResult?.error?.code === "ETIMEDOUT" || /ETIMEDOUT|timed out|timeout/i.test(String(processResult?.error?.message ?? ""));
  const provider = String(agentMeta?.provider ?? "").toLowerCase();
  const model = String(agentMeta?.model ?? "").toLowerCase();
  const providerCompatible = !provider || provider === "ollama";
  const modelCompatible = !model || model === "qwen3.5:9b" || model === MODEL;

  let status = "PASS";
  let reason = "OBSERVED_LOCAL_TOOL_EXECUTION";
  if (processTimedOut) {
    status = "FAILED";
    reason = "OPENCLAW_PROCESS_TIMEOUT";
  } else if (processResult?.status !== 0) {
    status = "FAILED";
    reason = "OPENCLAW_PROCESS_FAILED";
  } else if (!observedGit) {
    status = "FAILED";
    reason = "MISSING_OBSERVED_GIT_EXECUTION";
  } else if (!providerCompatible) {
    status = "FAILED";
    reason = "PROVIDER_MISMATCH";
  } else if (!modelCompatible) {
    status = "FAILED";
    reason = "MODEL_MISMATCH";
  }

  return { status, reason, observedGit, providerCompatible, modelCompatible };
}

export function runDiagnostic({ repoRoot, timeoutSeconds = 120 } = {}) {
  const resolvedRepoRoot = path.resolve(repoRoot ?? process.cwd());
  const gitProbe = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd: resolvedRepoRoot, encoding: "utf8", timeout: 10000 });
  if (gitProbe.status !== 0) throw new Error(`REPO_PREFLIGHT_FAILED:${tail(gitProbe.stderr || gitProbe.stdout, 1000)}`);
  const actualRoot = path.resolve(gitProbe.stdout.trim());
  if (actualRoot !== resolvedRepoRoot) throw new Error(`REPO_ROOT_MISMATCH:${actualRoot}`);

  const openclaw = findExecutable(["/opt/homebrew/bin/openclaw", "openclaw"]);
  if (!openclaw) throw new Error("OPENCLAW_NOT_FOUND");
  const ollama = findExecutable(["/opt/homebrew/bin/ollama", "ollama"]);

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jeeves-v3-local-tool-diagnostic-"));
  const controlWorkspace = path.join(tempRoot, "workspace");
  const stateDir = path.join(tempRoot, "state");
  fs.mkdirSync(controlWorkspace, { recursive: true });
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(path.join(controlWorkspace, "AGENTS.md"), [
    "# V3 Local Tool Diagnostic",
    `Protected repo: ${resolvedRepoRoot}`,
    "Code Mode is active. The outer exec tool accepts JavaScript/TypeScript, not raw shell.",
    "Dispatch shell commands through tools.callValue(\"openclaw:core:exec\", { command, workdir }).",
    "Do not initialize or modify the protected repo."
  ].join("\n") + "\n", "utf8");

  const harness = createObservedExecutionHarness({ issue: "diagnostic", workerId: "single" });
  const env = {
    ...process.env,
    ...harness.envPatch,
    OPENCLAW_WORKSPACE_DIR: controlWorkspace,
    OPENCLAW_STATE_DIR: stateDir,
    OPENCLAW_MODEL: MODEL,
    OPENCLAW_FALLBACK_MODELS: "",
    OLLAMA_API_KEY: process.env.OLLAMA_API_KEY || "ollama-local"
  };
  const shellCommand = "git status --short --branch";
  const bridgeCall = `return await tools.callValue("openclaw:core:exec", { command: ${JSON.stringify(shellCommand)}, workdir: ${JSON.stringify(resolvedRepoRoot)} });`;
  const prompt = [
    "V3_STANDALONE_TOOL_DIAGNOSTIC_V1.",
    "Code Mode is active. The model-visible exec tool accepts JavaScript/TypeScript, not raw shell.",
    "Immediately invoke the outer Code Mode exec tool exactly once with the following JavaScript. Do not explain, list tools, inspect memory, or answer first.",
    bridgeCall,
    "Never place raw shell directly in the outer Code Mode exec tool.",
    "After the nested shell tool finishes, reply only V3_DIAGNOSTIC_OK."
  ].join("\n");
  const args = [
    "agent", "exec", prompt,
    "--isolated", "--auth-env-only",
    "--model", MODEL,
    "--code-mode", "code",
    "--local-model-lean",
    "--cwd", controlWorkspace,
    "--json", "--timeout", String(timeoutSeconds)
  ];

  const ollamaBefore = ollama ? spawnSync(ollama, ["ps"], { encoding: "utf8", timeout: 10000 }) : null;
  const startedAt = Date.now();
  const processResult = spawnSync(openclaw, args, {
    cwd: controlWorkspace,
    env,
    encoding: "utf8",
    timeout: (Number(timeoutSeconds) + 30) * 1000,
    maxBuffer: 8 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"]
  });
  const elapsedMs = Date.now() - startedAt;
  const ollamaAfter = ollama ? spawnSync(ollama, ["ps"], { encoding: "utf8", timeout: 10000 }) : null;
  const evidence = readObservedExecutionEvidence(harness.journalPath);
  const agentMeta = parseAgentMeta(processResult.stdout);
  const classification = classifyDiagnostic({ processResult, evidence, agentMeta });

  const report = {
    diagnostic: "V3_STANDALONE_TOOL_DIAGNOSTIC_V1",
    status: classification.status,
    reason: classification.reason,
    modelRequired: MODEL,
    cloudFallbackAllowed: false,
    repoRoot: resolvedRepoRoot,
    controlWorkspace,
    stateDir,
    invocation: {
      executable: openclaw,
      args: args.map((value, index) => index === 2 ? "<DIAGNOSTIC_PROMPT>" : value),
      timeoutSeconds: Number(timeoutSeconds)
    },
    process: {
      status: processResult.status,
      signal: processResult.signal,
      errorCode: processResult.error?.code ?? null,
      error: processResult.error?.message ?? null,
      elapsedMs,
      stdoutTail: tail(processResult.stdout),
      stderrTail: tail(processResult.stderr)
    },
    agentMeta,
    executionEvidence: evidence,
    ollama: {
      before: tail(ollamaBefore?.stdout || ollamaBefore?.stderr, 2000),
      after: tail(ollamaAfter?.stdout || ollamaAfter?.stderr, 2000)
    }
  };
  return report;
}

async function main() {
  const repoRoot = arg("--repo-root", process.cwd());
  const timeoutSeconds = Number(arg("--timeout", "120"));
  const report = runDiagnostic({ repoRoot, timeoutSeconds });
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.status === "PASS" ? 0 : 1;
}

if (isMainModule(import.meta.url, process.argv[1])) {
  main().catch((error) => {
    console.error(JSON.stringify({ diagnostic: "V3_STANDALONE_TOOL_DIAGNOSTIC_V1", status: "FAILED", reason: "DIAGNOSTIC_CRASH", error: error?.stack ?? String(error) }, null, 2));
    process.exitCode = 1;
  });
}
