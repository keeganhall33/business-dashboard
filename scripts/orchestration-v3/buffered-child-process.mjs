import { spawn } from "node:child_process";
import { touchOwnedLeaseProgress } from "./lease-reconciliation.mjs";

export const DEFAULT_PROGRESS_TIMEOUT_MS = 240_000;
export const LOCAL_OPENCLAW_PROGRESS_TIMEOUT_MS = 600_000;

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
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;
    let progressTimedOut = false;
    let overflowed = false;
    let timer = null;
    let progressTimer = null;
    let hardKillTimer = null;
    let lastProgressAt = Date.now();

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

    const markProgress = (phase, { observedToolEvent = false } = {}) => {
      lastProgressAt = Date.now();
      touchOwnedLeaseProgress({
        phase,
        childPid,
        childProcessGroupId: process.platform === "win32" ? null : childPid,
        observedToolEvent
      });
    };

    const terminate = (reason = "TERMINATE") => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      markProgress(`CHILD_${reason}_TERM`);
      signalOwnedChild(child, "SIGTERM");

      if (!hardKillTimer) {
        hardKillTimer = setTimeout(() => {
          if (!settled && child.exitCode === null && child.signalCode === null) {
            markProgress(`CHILD_${reason}_KILL`);
            signalOwnedChild(child, "SIGKILL");
          }
        }, 5_000);
        hardKillTimer.unref?.();
      }
    };

    const cleanupTimers = () => {
      if (timer) clearTimeout(timer);
      if (progressTimer) clearInterval(progressTimer);
      if (hardKillTimer) clearTimeout(hardKillTimer);
    };

    const finish = ({ status = null, signal = null, error = null } = {}) => {
      if (settled) return;
      settled = true;
      cleanupTimers();
      markProgress("CHILD_COMPLETED");
      touchOwnedLeaseProgress({
        phase: "CHILD_REAPED",
        childPid: null,
        childProcessGroupId: null
      });

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
      markProgress("CHILD_STDOUT", { observedToolEvent: true });
      guardBuffer();
    });

    child.stderr?.on("data", (chunk) => {
      stderr += chunk;
      markProgress("CHILD_STDERR", { observedToolEvent: true });
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
          error: processError("Child process made no observable forward progress within the configured bound", "EPROGRESSSTALL")
        });
        return;
      }

      if (timedOut) {
        finish({
          status: code,
          signal,
          error: processError("Child process timed out", "ETIMEDOUT")
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
      if (settled) return;
      timedOut = true;
      terminate("TIMEOUT");
    }, timeout);
    timer.unref?.();

    progressTimer = setInterval(() => {
      if (settled || progressTimedOut) return;
      if (Date.now() - lastProgressAt <= effectiveProgressTimeout) return;
      progressTimedOut = true;
      touchOwnedLeaseProgress({
        phase: "PROGRESS_STALL_DETECTED",
        childPid,
        childProcessGroupId: process.platform === "win32" ? null : childPid
      });
      terminate("PROGRESS_STALL");
    }, Math.min(5_000, Math.max(1_000, Math.floor(effectiveProgressTimeout / 10))));
    progressTimer.unref?.();
  });
}
