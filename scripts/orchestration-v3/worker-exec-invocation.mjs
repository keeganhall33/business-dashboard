import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

const MODEL = "ollama/qwen3.5:9b";

function hasFlag(helpText, flag) {
  const escaped = flag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[\\s,])${escaped}(?=[\\s=<]|$)`, "m").test(String(helpText ?? ""));
}

function legacySessionKey({ sessionKey, controlWorkspace, prompt }) {
  if (sessionKey) return String(sessionKey);
  const digest = createHash("sha256")
    .update(`${String(controlWorkspace ?? "")}\n${String(prompt ?? "")}`)
    .digest("hex")
    .slice(0, 24);
  return `agent:main:jeeves-v3-${digest}`;
}

export function parseWorkerExecCapabilities(helpText) {
  const text = String(helpText ?? "");
  return {
    execSubcommand: /Usage:\s+openclaw\s+agent\s+exec\b/i.test(text),
    local: hasFlag(text, "--local"),
    message: hasFlag(text, "--message"),
    sessionKey: hasFlag(text, "--session-key"),
    isolated: hasFlag(text, "--isolated"),
    config: hasFlag(text, "--config"),
    stateDir: hasFlag(text, "--state-dir"),
    authEnvOnly: hasFlag(text, "--auth-env-only"),
    model: hasFlag(text, "--model"),
    codeMode: hasFlag(text, "--code-mode"),
    localModelLean: hasFlag(text, "--local-model-lean"),
    cwd: hasFlag(text, "--cwd"),
    json: hasFlag(text, "--json"),
    timeout: hasFlag(text, "--timeout")
  };
}

export function probeWorkerExecCapabilities(openclaw = "/opt/homebrew/bin/openclaw") {
  const probe = spawnSync(openclaw, ["agent", "exec", "--help"], {
    encoding: "utf8",
    timeout: 10_000,
    maxBuffer: 2 * 1024 * 1024
  });
  return parseWorkerExecCapabilities(`${probe.stdout ?? ""}\n${probe.stderr ?? ""}`);
}

export function buildWorkerExecInvocation({ capabilities, prompt, controlWorkspace, configPath, stateDir, sessionKey, timeoutSeconds = 900 }) {
  if (!capabilities?.model) {
    return { supported: false, reason: "OPENCLAW_WORKER_MISSING_MODEL_FLAG", args: [], mode: null, codeMode: false, promptIndex: null };
  }

  if (!capabilities.execSubcommand) {
    if (!capabilities.local || !capabilities.message) {
      return { supported: false, reason: "OPENCLAW_CLI_MISSING_LOCAL_MESSAGE_PATH", args: [], mode: null, codeMode: false, promptIndex: null };
    }
    if (!capabilities.sessionKey) {
      return { supported: false, reason: "OPENCLAW_CLI_MISSING_SESSION_SELECTOR", args: [], mode: null, codeMode: false, promptIndex: null };
    }
    const resolvedSessionKey = legacySessionKey({ sessionKey, controlWorkspace, prompt });
    const args = [
      "agent", "--local",
      "--session-key", resolvedSessionKey,
      "--message", prompt,
      "--model", MODEL
    ];
    if (capabilities.json) args.push("--json");
    if (capabilities.timeout) args.push("--timeout", String(timeoutSeconds));
    return {
      supported: true,
      reason: null,
      args,
      mode: "LEGACY_AGENT_LOCAL_MESSAGE",
      codeMode: false,
      promptIndex: 5,
      sessionKey: resolvedSessionKey
    };
  }

  if (!capabilities.config || !capabilities.stateDir) {
    return {
      supported: false,
      reason: !capabilities.config
        ? "OPENCLAW_AGENT_EXEC_MISSING_CONFIG_FLAG"
        : "OPENCLAW_AGENT_EXEC_MISSING_STATE_DIR_FLAG",
      args: [],
      mode: null,
      codeMode: false,
      promptIndex: null
    };
  }
  if (!configPath || !stateDir) {
    return {
      supported: false,
      reason: "OPENCLAW_AGENT_EXEC_STATE_NOT_PINNED",
      args: [],
      mode: null,
      codeMode: false,
      promptIndex: null
    };
  }

  const args = [
    "agent", "exec", prompt,
    "--config", String(configPath),
    "--state-dir", String(stateDir)
  ];
  // Do not use --isolated here. In current OpenClaw, --isolated intentionally
  // ignores the supplied/ambient config and falls back to exec defaults. V3
  // instead pins a generated stateless config plus an ephemeral state dir.
  if (capabilities.authEnvOnly) args.push("--auth-env-only");
  args.push("--model", MODEL);
  // V3 intentionally uses the direct agent-exec tool path.
  // Code Mode currently exposes repository file operations through the
  // isolated control-workspace sandbox rather than the protected worktree.
  // Repository operations are instead performed through the observed shell
  // execution harness with an explicit workdir.
  if (capabilities.localModelLean) args.push("--local-model-lean");
  if (capabilities.cwd) args.push("--cwd", controlWorkspace);
  if (capabilities.json) args.push("--json");
  if (capabilities.timeout) args.push("--timeout", String(timeoutSeconds));
  return {
    supported: true,
    reason: null,
    args,
    mode: "AGENT_EXEC_DIRECT",
    codeMode: false,
    promptIndex: 2,
    sessionKey: null
  };
}

export function codeModeShellInstruction(command, workdir) {
  return `return await tools.callValue("openclaw:core:exec", { command: ${JSON.stringify(String(command))}, workdir: ${JSON.stringify(String(workdir))} });`;
}
