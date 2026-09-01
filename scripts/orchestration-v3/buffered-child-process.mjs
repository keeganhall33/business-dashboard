import fs from "node:fs";
import { spawn } from "node:child_process";
import { performance } from "node:perf_hooks";
import { touchOwnedLeaseProgress } from "./lease-reconciliation.mjs";

export const DEFAULT_PROGRESS_TIMEOUT_MS = 240_000;
export const LOCAL_OPENCLAW_PROGRESS_TIMEOUT_MS = 600_000;

const PARENT_SIGNAL_EXIT_CODES = Object.freeze({
  SIGHUP: 129,
  SIGINT: 130,
  SIGTERM: 143
});

export function resolveProgressTimeout(command, configuredTimeout = null) {
  const configured = Number(configuredTimeout);
  if (Number.isFinite(configured) && configured > 0) return configured;

  const executable = String(command ?? "").split(/[\\/]/).pop()?.toLowerCase() ?? "";
  return executable === "openclaw"
    ? LOCAL_OPENCLAW_PROGRESS_TIMEOUT_MS
    : DEFAULT_PROGRESS_TIMEOUT_MS;
}

function processError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function signalOwnedChild(child, signal) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return false;
  const pid = Number(child.pid);
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    if (process.platform !== "win32") {
      process.kill(-pid, signal);
    } else {
      child.kill(signal);
    }
    return true;
  } catch (error) {
    if (error?.code === "ESRCH") return false;
    try {
      child.kill(signal);
      return true;
    } catch {
      return false;
    }
  }
}

function journalLineIsMeaningful(line) {
  const parts = String(line ?? "").trim().split("\t");
  if (parts.length < 4) return false;
  const tool = String(parts[1] ?? "").trim().toLowerCase();
  const command = parts.slice(3).join("\t").trim().toLowerCase();
  if (!command) return false;

  if (tool === "git") {
    const readOnlyGit = /^(?:status\b|diff(?:\s+--check)?\b|rev-parse\b|log\b|show\b|branch(?:\s+--show-current)?\b|worktree\s+list\b)/;
    if (readOnlyGit.test(command)) return false;
  }

  return true;
}

function journalDeltaIsMeaningful(delta) {
  return String(delta ?? "")
    .split(/\r?\n/)
    .some((line) => journalLineIsMeaningful(line));
}

export function runBufferedChild(
  command,
  args,
  {
    cwd,
    env,
    timeout = 950_000,
    progressTimeout = null,
    maxBuffer = 24 * 1024 * 1024
  } = {}
) {
  return new Promise((resolve) => {
    const effectiveProgressTimeout = resolveProgressTimeout(command, progressTimeout);
    const executionJournalPath = String(env?.ORCH_EXECUTION_JOURNAL ?? "").trim() || null;
    let journalFingerprint = null;
    let journalSize = 0;
    if (executionJournalPath) {
      try {
        const stat = fs.statSync(executionJournalPath);
        journalFingerprint = `${stat.size}:${stat.mtimeMs}`;
        journalSize = stat.size;
      } catch {}
    }

    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;
    let progressTimedOut = false;
    let overflowed = false;
    let parentSignal = null;
    let timer = null;
    let progressTimer = null;
    let hardKillTimer = null;
    const childStartAt = performance.now();
    const hardDeadlineAt = childStartAt + Number(timeout);
    let lastSemanticProgressAt = childStartAt;
    const parentSignalHandlers = new Map();

    const child = spawn(command, args, {
      cwd,
      env,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"]
    });

    const childPid = Number(child.pid) || null;
    touchOwnedLeaseProgress({
      phase: "CHILD_STARTED",
      childPid,
      childProcessGroupId: process.platform === "win32" ? null : childPid
    });

    const markSemanticProgress = (phase, { observedToolEvent = false } = {}) => {
      lastSemanticProgressAt = performance.now();
      touchOwnedLeaseProgress({
        phase,
        childPid,
        childProcessGroupId: process.platform === "win32" ? null : childPid,
        observedToolEvent,
        semanticProgress: true
      });
    };

    const markTelemetry = (phase, { observedToolEvent = false } = {}) => {
      touchOwnedLeaseProgress({
        phase,
        childPid,
        childProcessGroupId: process.platform === "win32" ? null : childPid,
        observedToolEvent,
        semanticProgress: false
      });
    };

    const observeExecutionJournalProgress = () => {
      if (!executionJournalPath) return false;
      try {
        const stat = fs.statSync(executionJournalPath);
        const nextFingerprint = `${stat.size}:${stat.mtimeMs}`;
        if (journalFingerprint === null) {
          journalFingerprint = nextFingerprint;
          journalSize = stat.size;
          return false;
        }
        if (nextFingerprint === journalFingerprint) return false;

        let delta = "";
        if (stat.size >= journalSize) {
          const bytes = stat.size - journalSize;
          if (bytes > 0) {
            const fd = fs.openSync(executionJournalPath, "r");
            try {
              const buffer = Buffer.alloc(bytes);
              fs.readSync(fd, buffer, 0, bytes, journalSize);
              delta = buffer.toString("utf8");
            } finally {
              fs.closeSync(fd);
            }
          }
        }

        journalFingerprint = nextFingerprint;
        journalSize = stat.size;

        if (journalDeltaIsMeaningful(delta)) {
          markSemanticProgress("CHILD_MEANINGFUL_TOOL_PROGRESS", { observedToolEvent: true });
          return true;
        }

        markTelemetry("CHILD_TOOL_JOURNAL_TELEMETRY", { observedToolEvent: true });
        return false;
      } catch {
        return false;
      }
    };

    const terminate = (reason = "TERMINATE") => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      markTelemetry(`CHILD_${reason}_TERM`);
      signalOwnedChild(child, "SIGTERM");

      if (!hardKillTimer) {
        hardKillTimer = setTimeout(() => {
          if (!settled && child.exitCode === null && child.signalCode === null) {
            markTelemetry(`CHILD_${reason}_KILL`);
            signalOwnedChild(child, "SIGKILL");
          }
        }, 5_000);
        hardKillTimer.unref?.();
      }
    };

    const cleanupTimersAndSignals = () => {
      if (timer) clearTimeout(timer);
      if (progressTimer) clearInterval(progressTimer);
      if (hardKillTimer) clearTimeout(hardKillTimer);
      for (const [signal, handler] of parentSignalHandlers) {
        process.removeListener(signal, handler);
      }
      parentSignalHandlers.clear();
    };

    const finish = ({ status = null, signal = null, error = null } = {}) => {
      if (settled) return;
      settled = true;
      cleanupTimersAndSignals();
      markTelemetry("CHILD_COMPLETED");
      touchOwnedLeaseProgress({
        phase: "CHILD_REAPED",
        childPid: null,
        childProcessGroupId: null,
        semanticProgress: false
      });

      if (parentSignal) {
        process.exitCode = PARENT_SIGNAL_EXIT_CODES[parentSignal] ?? 1;
        return;
      }

      resolve({
        status,
        signal,
        stdout,
        stderr,
        error,
        childPid,
        childProcessGroupId: process.platform === "win32" ? null : childPid
      });
    };

    const requestParentShutdown = (signal) => {
      if (settled || parentSignal) return;
      parentSignal = signal;
      markTelemetry(`PARENT_${signal}_RECEIVED`);
      terminate(`PARENT_${signal}`);
    };

    for (const signal of Object.keys(PARENT_SIGNAL_EXIT_CODES)) {
      const handler = () => requestParentShutdown(signal);
      parentSignalHandlers.set(signal, handler);
      process.once(signal, handler);
    }

    const guardBuffer = () => {
      if (overflowed) return;
      if (
        Buffer.byteLength(stdout, "utf8") +
          Buffer.byteLength(stderr, "utf8") >
        maxBuffer
      ) {
        overflowed = true;
        terminate("BUFFER_OVERFLOW");
      }
    };

    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");

    child.stdout?.on("data", (chunk) => {
      stdout += chunk;
      markSemanticProgress("CHILD_STDOUT", { observedToolEvent: true });
      guardBuffer();
    });

    child.stderr?.on("data", (chunk) => {
      stderr += chunk;
      markSemanticProgress("CHILD_STDERR", { observedToolEvent: true });
      guardBuffer();
    });

    child.on("error", (error) => {
      finish({ error });
    });

    child.on("close", (code, signal) => {
      if (progressTimedOut) {
        finish({
          status: code,
          signal,
          error: processError("Child process made no meaningful forward progress within the configured bound", "EPROGRESSSTALL")
        });
        return;
      }

      if (timedOut) {
        finish({
          status: code,
          signal,
          error: processError("Child process exceeded the absolute runtime deadline", "ETIMEDOUT")
        });
        return;
      }

      if (overflowed) {
        finish({
          status: code,
          signal,
          error: processError("Child process exceeded maxBuffer", "ENOBUFS")
        });
        return;
      }

      finish({ status: code, signal, error: null });
    });

    timer = setTimeout(() => {
      if (settled || timedOut) return;
      timedOut = true;
      markTelemetry("ABSOLUTE_TIMEOUT_DETECTED");
      terminate("ABSOLUTE_TIMEOUT");
    }, timeout);
    timer.unref?.();

    progressTimer = setInterval(() => {
      if (settled || progressTimedOut || timedOut) return;

      observeExecutionJournalProgress();
      const now = performance.now();

      if (now >= hardDeadlineAt) {
        timedOut = true;
        markTelemetry("ABSOLUTE_TIMEOUT_DETECTED");
        terminate("ABSOLUTE_TIMEOUT");
        return;
      }

      if (now - lastSemanticProgressAt <= effectiveProgressTimeout) return;
      progressTimedOut = true;
      markTelemetry("SEMANTIC_PROGRESS_STALL_DETECTED");
      terminate("SEMANTIC_PROGRESS_STALL");
    }, Math.min(5_000, Math.max(1_000, Math.floor(Math.min(effectiveProgressTimeout, timeout) / 10))));
    progressTimer.unref?.();
  });
}
