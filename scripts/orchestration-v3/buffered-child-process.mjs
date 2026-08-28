import { spawn } from "node:child_process";

function processError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

export function runBufferedChild(
  command,
  args,
  {
    cwd,
    env,
    timeout = 950_000,
    maxBuffer = 24 * 1024 * 1024
  } = {}
) {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;
    let overflowed = false;
    let timer = null;
    let hardKillTimer = null;

    const child = spawn(command, args, {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"]
    });

    const terminate = () => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      child.kill("SIGTERM");

      if (!hardKillTimer) {
        hardKillTimer = setTimeout(() => {
          if (!settled && child.exitCode === null && child.signalCode === null) {
            child.kill("SIGKILL");
          }
        }, 5_000);
      }
    };

    const finish = ({ status = null, signal = null, error = null } = {}) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (hardKillTimer) clearTimeout(hardKillTimer);

      resolve({
        status,
        signal,
        stdout,
        stderr,
        error
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
        terminate();
      }
    };

    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");

    child.stdout?.on("data", (chunk) => {
      stdout += chunk;
      guardBuffer();
    });

    child.stderr?.on("data", (chunk) => {
      stderr += chunk;
      guardBuffer();
    });

    child.on("error", (error) => {
      finish({ error });
    });

    child.on("close", (code, signal) => {
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

      finish({
        status: code,
        signal,
        error: null
      });
    });

    timer = setTimeout(() => {
      if (settled) return;
      timedOut = true;
      terminate();
    }, timeout);
  });
}
