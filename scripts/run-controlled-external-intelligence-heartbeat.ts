import "@/lib/server-only";

import {
  DEFAULT_CONTROLLED_HEARTBEAT_DEPS,
  runControlledExternalIntelligenceHeartbeatV1WithDeps
} from "@/lib/external-intelligence/orchestration/controlled-heartbeat-operator";

function safeSummary(error: unknown) {
  if (error instanceof Error) return error.message.slice(0, 300);
  if (error && typeof error === "object") {
    try {
      return JSON.stringify(error).slice(0, 300);
    } catch {
      return Object.prototype.toString.call(error).slice(0, 300);
    }
  }
  return String(error).slice(0, 300);
}

function parseInvocationJsonArg(argv: string[]) {
  const idx = argv.findIndex((x) => x === "--invocation-json");
  if (idx === -1) return null;
  const raw = argv[idx + 1];
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function main() {
  const env = process.env.OPERATOR_ENVIRONMENT;
  if (env !== "production") throw new Error("precondition_failed:operator_env_not_production");

  const invocationJson = parseInvocationJsonArg(process.argv.slice(2));
  if (!invocationJson) throw new Error("missing_argument:--invocation-json");

  await runControlledExternalIntelligenceHeartbeatV1WithDeps(DEFAULT_CONTROLLED_HEARTBEAT_DEPS, {
    expected_project_ref: "ibjsjosplgbqevmnvvpf",
    invocation_json: invocationJson
  });
}

main().catch((e) => {
  console.error("Controlled heartbeat failed", { error: safeSummary(e) });
  process.exitCode = 1;
});
