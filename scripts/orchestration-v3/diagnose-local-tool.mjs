import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createObservedExecutionHarness, readObservedExecutionEvidence } from "./execution-evidence.mjs";

const MODEL = "ollama/qwen3.5:9b";
const LEGACY_SESSION_KEY = "agent:main:jeeves-v3-diagnostic";
const CLOUD_CREDENTIAL_PREFIXES = [
  "OPENAI_", "ANTHROPIC_", "CODEX_", "GOOGLE_", "GEMINI_", "XAI_", "MISTRAL_",
  "GROQ_", "DEEPSEEK_", "PERPLEXITY_", "OPENROUTER_", "COHERE_", "HUGGINGFACE_",
  "HF_", "TOGETHER_", "CEREBRAS_", "FIREWORKS_", "AZURE_", "BEDROCK_"
];

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

function hasFlag(helpText, flag) {
  const escaped = flag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[\\s,])${escaped}(?=[\\s=<]|$)`, "m").test(String(helpText ?? ""));
}

export function parseExecCapabilities(helpText) {
  const text = String(helpText ?? "");
  return {
    execSubcommand: /Usage:\s+openclaw\s+agent\s+exec\b/i.test(text),
    local: hasFlag(text, "--local"),
    message: hasFlag(text, "--message"),
    sessionKey: hasFlag(text, "--session-key"),
    isolated: hasFlag(text, "--isolated"),
    authEnvOnly: hasFlag(text, "--auth-env-only"),
    model: hasFlag(text, "--model"),
    codeMode: hasFlag(text, "--code-mode"),
    localModelLean: hasFlag(text, "--local-model-lean"),
    cwd: hasFlag(text, "--cwd"),
    json: hasFlag(text, "--json"),
    timeout: hasFlag(text, "--timeout")
  };
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
  const providerCompatible = provider === "ollama";
  const modelCompatible = model === "qwen3.5:9b" || model === MODEL;

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
  } else if (!provider || !model) {
    status = "FAILED";
    reason = "MISSING_PROVIDER_MODEL_EVIDENCE";
  } else if (!providerCompatible) {
    status = "FAILED";
    reason = "PROVIDER_MISMATCH";
  } else if (!modelCompatible) {
    status = "FAILED";
    reason = "MODEL_MISMATCH";
  }

  return { status, reason, observedGit, providerCompatible, modelCompatible };
}

export function buildIsolatedEnvironment({ baseEnv = process.env, tempHome, stateDir, configPath, controlWorkspace, harnessEnv = {} }) {
  const env = { ...baseEnv };
  for (const key of Object.keys(env)) {
    if (key.startsWith("OPENCLAW_")) delete env[key];
    if (CLOUD_CREDENTIAL_PREFIXES.some((prefix) => key.startsWith(prefix)) && /(KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|AUTH)/i.test(key)) {
      delete env[key];
    }
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

export function buildExecInvocation({ capabilities, prompt, controlWorkspace, timeoutSeconds }) {
  if (!capabilities.model) {
    return { supported: false, reason: "OPENCLAW_CLI_MISSING_MODEL_FLAG", args: [], toolMode: null, mode: null, promptIndex: null };
  }

  if (!capabilities.execSubcommand) {
    if (!capabilities.local || !capabilities.message) {
      return { supported: false, reason: "OPENCLAW_CLI_MISSING_LOCAL_MESSAGE_PATH", args: [], toolMode: null, mode: null, promptIndex: null };
    }
    if (!capabilities.sessionKey) {
      return { supported: false, reason: "OPENCLAW_CLI_MISSING_SESSION_SELECTOR", args: [], toolMode: null, mode: null, promptIndex: null };
    }
    const args = [
      "agent", "--local",
      "--session-key", LEGACY_SESSION_KEY,
      "--message", prompt,
      "--model", MODEL
    ];
    if (capabilities.json) args.push("--json");
    if (capabilities.timeout) args.push("--timeout", String(timeoutSeconds));
    return {
      supported: true,
      reason: null,
      args,
      toolMode: "direct",
      mode: "LEGACY_AGENT_LOCAL_MESSAGE",
      promptIndex: 5
    };
  }

  const args = ["agent", "exec", prompt];
  if (capabilities.isolated) args.push("--isolated");
  if (capabilities.authEnvOnly) args.push("--auth-env-only");
  args.push("--model", MODEL);
  const toolMode = capabilities.codeMode ? "code" : "direct";
  if (capabilities.codeMode) args.push("--code-mode", "code");
  if (capabilities.localModelLean) args.push("--local-model-lean");
  if (capabilities.cwd) args.push("--cwd", controlWorkspace);
  if (capabilities.json) args.push("--json");
  if (capabilities.timeout) args.push("--timeout", String(timeoutSeconds));
  return {
    supported: true,
    reason: null,
    args,
    toolMode,
    mode: "AGENT_EXEC",
    promptIndex: 2
  };
}

function buildPrompt({ toolMode, repoRoot }) {
  const shellCommand = "git status --short --branch";
  if (toolMode === "code") {
    const bridgeCall = `return await tools.callValue("openclaw:core:exec", { command: ${JSON.stringify(shellCommand)}, workdir: ${JSON.stringify(repoRoot)} });`;
    return [
      "V3_STANDALONE_TOOL_DIAGNOSTIC_V1.",
      "Code Mode is active. The model-visible exec tool accepts JavaScript/TypeScript, not raw shell.",
      "Immediately invoke the outer Code Mode exec tool exactly once with the following JavaScript. Do not explain, list tools, inspect memory, or answer first.",
      bridgeCall,
      "Never place raw shell directly in the outer Code Mode exec tool.",
      "After the nested shell tool finishes, reply only V3_DIAGNOSTIC_OK."
    ].join("\n");
  }
  return [
    "V3_STANDALONE_TOOL_DIAGNOSTIC_V1.",
    "Immediately use the shell exec tool exactly once. Do not explain, list tools, inspect memory, or answer first.",
    `Run command: ${shellCommand}`,
    `Use exact workdir: ${repoRoot}`,
    "After the command finishes, reply only V3_DIAGNOSTIC_OK."
  ].join("\n");
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

  const helpProbe = spawnSync(openclaw, ["agent", "exec", "--help"], { encoding: "utf8", timeout: 10000, maxBuffer: 2 * 1024 * 1024 });
  const helpText = `${helpProbe.stdout ?? ""}\n${helpProbe.stderr ?? ""}`;
  const capabilities = parseExecCapabilities(helpText);
  const versionProbe = spawnSync(openclaw, ["--version"], { encoding: "utf8", timeout: 10000 });

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jeeves-v3-local-tool-diagnostic-"));
  const tempHome = path.join(tempRoot, "home");
  const controlWorkspace = path.join(tempRoot, "workspace");
  const stateDir = path.join(tempRoot, "state");
  const configPath = path.join(tempRoot, "openclaw.json");
  fs.mkdirSync(tempHome, { recursive: true });
  fs.mkdirSync(controlWorkspace, { recursive: true });
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(configPath, "{}\n", "utf8");
  fs.writeFileSync(path.join(controlWorkspace, "AGENTS.md"), [
    "# V3 Local Tool Diagnostic",
    `Protected repo: ${resolvedRepoRoot}`,
    "Execute only the requested harmless git status command against the protected repo.",
    "Do not initialize or modify the protected repo."
  ].join("\n") + "\n", "utf8");

  const harness = createObservedExecutionHarness({ issue: "diagnostic", workerId: "single" });
  const env = buildIsolatedEnvironment({
    baseEnv: process.env,
    tempHome,
    stateDir,
    configPath,
    controlWorkspace,
    harnessEnv: harness.envPatch
  });

  const provisionalToolMode = capabilities.execSubcommand && capabilities.codeMode ? "code" : "direct";
  const prompt = buildPrompt({ toolMode: provisionalToolMode, repoRoot: resolvedRepoRoot });
  const invocation = buildExecInvocation({ capabilities, prompt, controlWorkspace, timeoutSeconds });
  if (!invocation.supported) {
    return {
      diagnostic: "V3_STANDALONE_TOOL_DIAGNOSTIC_V1",
      status: "FAILED",
      reason: invocation.reason,
      modelRequired: MODEL,
      cloudFallbackAllowed: false,
      repoRoot: resolvedRepoRoot,
      cli: {
        version: tail(versionProbe.stdout || versionProbe.stderr, 1000).trim(),
        helpStatus: helpProbe.status,
        capabilities,
        helpTail: tail(helpText, 4000)
      },
      executionEvidence: readObservedExecutionEvidence(harness.journalPath)
    };
  }

  const ollamaBefore = ollama ? spawnSync(ollama, ["ps"], { encoding: "utf8", timeout: 10000 }) : null;
  const startedAt = Date.now();
  const processResult = spawnSync(openclaw, invocation.args, {
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

  return {
    diagnostic: "V3_STANDALONE_TOOL_DIAGNOSTIC_V1",
    status: classification.status,
    reason: classification.reason,
    modelRequired: MODEL,
    cloudFallbackAllowed: false,
    repoRoot: resolvedRepoRoot,
    controlWorkspace,
    stateDir,
    configPath,
    isolation: {
      mode: capabilities.isolated || capabilities.authEnvOnly ? "CLI_FLAGS_PLUS_TEMP_PATHS" : "TEMP_PATHS_AND_SANITIZED_ENV",
      temporaryHome: tempHome,
      ambientOpenClawConfigInherited: false,
      ambientCloudCredentialsStripped: true
    },
    cli: {
      version: tail(versionProbe.stdout || versionProbe.stderr, 1000).trim(),
      helpStatus: helpProbe.status,
      capabilities,
      helpTail: tail(helpText, 4000)
    },
    invocation: {
      executable: openclaw,
      mode: invocation.mode,
      args: invocation.args.map((value, index) => index === invocation.promptIndex ? "<DIAGNOSTIC_PROMPT>" : value),
      toolMode: invocation.toolMode,
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
