import { spawnSync } from "node:child_process";

const MODEL = "ollama/qwen3.5:9b";

function hasFlag(helpText, flag) {
  const escaped = flag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[\\s,])${escaped}(?=[\\s=<]|$)`, "m").test(String(helpText ?? ""));
}

export function parseWorkerExecCapabilities(helpText) {
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

export function probeWorkerExecCapabilities(openclaw = "/opt/homebrew/bin/openclaw") {
  const probe = spawnSync(openclaw, ["agent", "exec", "--help"], {
    encoding: "utf8",
    timeout: 10_000,
    maxBuffer: 2 * 1024 * 1024
  });
  return parseWorkerExecCapabilities(`${probe.stdout ?? ""}\n${probe.stderr ?? ""}`);
}

export function buildWorkerExecInvocation({ capabilities, prompt, controlWorkspace, sessionKey, timeoutSeconds = 900 }) {
  if (!capabilities?.model) {
    return { supported: false, reason: "OPENCLAW_WORKER_MISSING_MODEL_FLAG", args: [], mode: null, codeMode: false, promptIndex: null };
  }

  if (!capabilities.execSubcommand) {
    if (!capabilities.local || !capabilities.message) {
      return { supported: false, reason: "OPENCLAW_CLI_MISSING_LOCAL_MESSAGE_PATH", args: [], mode: null, codeMode: false, promptIndex: null };
    }
    if (!capabilities.sessionKey || !sessionKey) {
      return { supported: false, reason: "OPENCLAW_CLI_MISSING_SESSION_SELECTOR", args: [], mode: null, codeMode: false, promptIndex: null };
    }
    const args = [
      "agent", "--local",
      "--session-key", sessionKey,
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
      promptIndex: 5
    };
  }

  const args = ["agent", "exec", prompt];
  if (capabilities.isolated) args.push("--isolated");
  if (capabilities.authEnvOnly) args.push("--auth-env-only");
  args.push("--model", MODEL);
  if (capabilities.codeMode) args.push("--code-mode", "code");
  if (capabilities.localModelLean) args.push("--local-model-lean");
  if (capabilities.cwd) args.push("--cwd", controlWorkspace);
  if (capabilities.json) args.push("--json");
  if (capabilities.timeout) args.push("--timeout", String(timeoutSeconds));
  return {
    supported: true,
    reason: null,
    args,
    mode: capabilities.codeMode ? "AGENT_EXEC_CODE_MODE" : "AGENT_EXEC_DIRECT",
    codeMode: Boolean(capabilities.codeMode),
    promptIndex: 2
  };
}

export function codeModeShellInstruction(command, workdir) {
  return `return await tools.callValue("openclaw:core:exec", { command: ${JSON.stringify(String(command))}, workdir: ${JSON.stringify(String(workdir))} });`;
}
