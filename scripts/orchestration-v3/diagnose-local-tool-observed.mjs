import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createObservedExecutionHarness, readObservedExecutionEvidence } from "./execution-evidence.mjs";

const MODEL = "ollama/qwen3.5:9b";
const SESSION_KEY = "agent:main:jeeves-v3-observed-diagnostic";
const CLOUD_CREDENTIAL_PREFIXES = [
  "OPENAI_", "ANTHROPIC_", "CODEX_", "GOOGLE_", "GEMINI_", "XAI_", "MISTRAL_",
  "GROQ_", "DEEPSEEK_", "PERPLEXITY_", "OPENROUTER_", "COHERE_", "HUGGINGFACE_",
  "HF_", "TOGETHER_", "CEREBRAS_", "FIREWORKS_", "AZURE_", "BEDROCK_"
];

function arg(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 && index + 1 < process.argv.length ? process.argv[index + 1] : fallback;
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

export function buildObservedPrompt({ observedGit, repoRoot }) {
  return [
    "V3_STANDALONE_OBSERVED_TOOL_DIAGNOSTIC_V2.",
    "Immediately use the shell exec tool exactly once. Do not explain, list tools, inspect memory, or answer first.",
    `Run this exact command: ${observedGit} status --short --branch`,
    `Use exact workdir: ${repoRoot}`,
    "Do not substitute another git executable or alter the command.",
    "After the command finishes successfully, reply only V3_DIAGNOSTIC_OK."
  ].join("\n");
}

export function writeExecOnlyToolPolicy(configPath) {
  let config = {};
  try {
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, "utf8").trim();
      if (raw) config = JSON.parse(raw);
    }
  } catch {
    config = {};
  }

  const existingTools = config?.tools && typeof config.tools === "object" ? config.tools : {};
  const existingDeny = Array.isArray(existingTools.deny) ? existingTools.deny : [];
  config = {
    ...config,
    tools: {
      ...existingTools,
      deny: [...new Set([...existingDeny, "group:fs"])]
    },
    memory: {
      ...(config.memory ?? {}),
      search: {
        ...(config.memory?.search ?? {}),
        enabled: false,
        rememberAcrossConversations: false,
        fallback: "none",
        experimental: {
          ...(config.memory?.search?.experimental ?? {}),
          sessionMemory: false
        }
      }
    },
    agents: {
      ...(config.agents ?? {}),
      defaults: {
        ...(config.agents?.defaults ?? {}),
        compaction: {
          ...(config.agents?.defaults?.compaction ?? {}),
          memoryFlush: {
            ...(config.agents?.defaults?.compaction?.memoryFlush ?? {}),
            enabled: false
          }
        }
      }
    }
  };

  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  return config;
}

export function buildIsolatedEnvironment({ baseEnv = process.env, tempHome, stateDir, configPath, controlWorkspace, harnessEnv = {} }) {
  // V3 protected-repository access is exec-only. OpenClaw filesystem tools are
  // hard-disabled in the isolated worker config so a model cannot terminate a
  // real implementation round by attempting a sandboxed read/write/edit of the
  // protected worktree. Shell exec remains available and is still observed by
  // the host evidence harness.
  writeExecOnlyToolPolicy(configPath);

  const env = { ...baseEnv };
  for (const key of Object.keys(env)) {
    if (key.startsWith("OPENCLAW_")) delete env[key];
    if (CLOUD_CREDENTIAL_PREFIXES.some((prefix) => key.startsWith(prefix)) && /(KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|AUTH)/i.test(key)) delete env[key];
  }
  Object.assign(env, harnessEnv, {
    HOME: tempHome,
    OPENCLAW_HOME: tempHome,
    OPENCLAW_STATE_DIR: stateDir,
    OPENCLAW_CONFIG_PATH: configPath,
    OPENCLAW_WORKSPACE_DIR: controlWorkspace,
    OPENCLAW_LOAD_SHELL_ENV: "0",
    OPENCLAW_EXEC_SHELL_SNAPSHOT: "0",
    OPENCLAW_NO_AUTO_UPDATE: "1",
    OPENCLAW_MODEL: MODEL,
    OPENCLAW_FALLBACK_MODELS: "",
    OLLAMA_API_KEY: baseEnv.OLLAMA_API_KEY || "ollama-local"
  });
  if (baseEnv.OLLAMA_HOST) env.OLLAMA_HOST = baseEnv.OLLAMA_HOST;
  return env;
}

function walkFind(value, key) {
  if (!value || typeof value !== "object") return undefined;
  if (Object.prototype.hasOwnProperty.call(value, key)) return value[key];
  for (const child of Object.values(value)) {
    const found = walkFind(child, key);
    if (found !== undefined) return found;
  }
  return undefined;
}

export function parseMachineEnvelope(stdout) {
  try {
    const value = JSON.parse(String(stdout ?? ""));
    const meta = value?.meta?.agentMeta ?? value?.agentMeta ?? value?.result?.agentMeta ?? walkFind(value, "agentMeta") ?? {};
    return {
      provider: meta?.provider ?? walkFind(value, "winnerProvider") ?? null,
      model: meta?.model ?? walkFind(value, "winnerModel") ?? null,
      fallbackUsed: walkFind(value, "fallbackUsed") ?? null,
      toolCalls: walkFind(value, "calls") ?? null,
      toolFailures: walkFind(value, "failures") ?? null,
      parseError: null
    };
  } catch (error) {
    return { provider: null, model: null, fallbackUsed: null, toolCalls: null, toolFailures: null, parseError: error?.message ?? String(error) };
  }
}

export function classifyObservedDiagnostic({ processResult, evidence, machine }) {
  const timedOut = processResult?.error?.code === "ETIMEDOUT" || /ETIMEDOUT|timed out|timeout/i.test(String(processResult?.error?.message ?? ""));
  const observedGit = evidence.successfulCommands.some((command) => /^git status --short --branch\b/.test(command));
  const providerOk = String(machine?.provider ?? "").toLowerCase() === "ollama";
  const model = String(machine?.model ?? "").toLowerCase();
  const modelOk = model === "qwen3.5:9b" || model === MODEL;
  const fallbackOk = machine?.fallbackUsed === false;

  if (timedOut) return { status: "FAILED", reason: "OPENCLAW_PROCESS_TIMEOUT" };
  if (processResult?.status !== 0) return { status: "FAILED", reason: "OPENCLAW_PROCESS_FAILED" };
  if (!observedGit) return { status: "FAILED", reason: "MISSING_OBSERVED_GIT_EXECUTION" };
  if (!providerOk) return { status: "FAILED", reason: "PROVIDER_MISMATCH" };
  if (!modelOk) return { status: "FAILED", reason: "MODEL_MISMATCH" };
  if (!fallbackOk) return { status: "FAILED", reason: "FALLBACK_NOT_PROVEN_FALSE" };
  return { status: "PASS", reason: "OBSERVED_LOCAL_TOOL_EXECUTION" };
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

export function runObservedDiagnostic({ repoRoot, timeoutSeconds = 120 } = {}) {
  const resolvedRepoRoot = path.resolve(repoRoot ?? process.cwd());
  const rootProbe = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd: resolvedRepoRoot, encoding: "utf8", timeout: 10000 });
  if (rootProbe.status !== 0 || path.resolve(rootProbe.stdout.trim()) !== resolvedRepoRoot) throw new Error("REPO_PREFLIGHT_FAILED");

  const openclaw = findExecutable(["/opt/homebrew/bin/openclaw", "openclaw"]);
  if (!openclaw) throw new Error("OPENCLAW_NOT_FOUND");
  const ollama = findExecutable(["/opt/homebrew/bin/ollama", "ollama"]);

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jeeves-v3-observed-tool-diagnostic-"));
  const tempHome = path.join(tempRoot, "home");
  const controlWorkspace = path.join(tempRoot, "workspace");
  const stateDir = path.join(tempRoot, "state");
  const configPath = path.join(tempRoot, "openclaw.json");
  for (const dir of [tempHome, controlWorkspace, stateDir]) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(configPath, "{}\n", "utf8");
  fs.writeFileSync(path.join(controlWorkspace, "AGENTS.md"), "# V3 observed tool diagnostic\n", "utf8");

  const harness = createObservedExecutionHarness({ issue: "diagnostic-v2", workerId: "single" });
  const observedGit = path.join(harness.shimRoot, "git");
  if (!fs.existsSync(observedGit)) throw new Error("OBSERVED_GIT_WRAPPER_MISSING");
  const prompt = buildObservedPrompt({ observedGit, repoRoot: resolvedRepoRoot });
  const env = buildIsolatedEnvironment({ baseEnv: process.env, tempHome, stateDir, configPath, controlWorkspace, harnessEnv: harness.envPatch });
  const args = [
    "agent", "--local",
    "--session-key", SESSION_KEY,
    "--message", prompt,
    "--model", MODEL,
    "--json",
    "--timeout", String(timeoutSeconds)
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
  const machine = parseMachineEnvelope(processResult.stdout);
  const classification = classifyObservedDiagnostic({ processResult, evidence, machine });

  return {
    diagnostic: "V3_STANDALONE_OBSERVED_TOOL_DIAGNOSTIC_V2",
    status: classification.status,
    reason: classification.reason,
    modelRequired: MODEL,
    cloudFallbackAllowed: false,
    repoRoot: resolvedRepoRoot,
    observedGit,
    isolation: {
      temporaryHome: tempHome,
      stateDir,
      configPath,
      controlWorkspace,
      ambientCloudCredentialsStripped: true
    },
    invocation: {
      executable: openclaw,
      mode: "LEGACY_AGENT_LOCAL_ABSOLUTE_OBSERVED_WRAPPER",
      args: args.map((value, index) => index === 5 ? "<DIAGNOSTIC_PROMPT>" : value),
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
    machine,
    executionEvidence: evidence,
    ollama: {
      before: tail(ollamaBefore?.stdout || ollamaBefore?.stderr, 2000),
      after: tail(ollamaAfter?.stdout || ollamaAfter?.stderr, 2000)
    }
  };
}

async function main() {
  const report = runObservedDiagnostic({ repoRoot: arg("--repo-root", process.cwd()), timeoutSeconds: Number(arg("--timeout", "120")) });
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.status === "PASS" ? 0 : 1;
}

if (isMainModule(import.meta.url, process.argv[1])) {
  main().catch((error) => {
    console.error(JSON.stringify({ diagnostic: "V3_STANDALONE_OBSERVED_TOOL_DIAGNOSTIC_V2", status: "FAILED", reason: "DIAGNOSTIC_CRASH", error: error?.stack ?? String(error) }, null, 2));
    process.exitCode = 1;
  });
}
