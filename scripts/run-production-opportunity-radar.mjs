#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const root = process.cwd();
const executable = resolve(root, "node_modules/.bin/tsx");
const entrypoint = resolve(root, "src/lib/discovery-intelligence/production-opportunity-radar/cli.ts");
const result = spawnSync(executable, [entrypoint], {
  cwd: root,
  env: process.env,
  stdio: "inherit",
  timeout: 120_000
});

if (result.error?.code === "ETIMEDOUT") {
  process.stderr.write("PRODUCTION_OPPORTUNITY_RADAR_TIMEOUT\n");
  process.exitCode = 124;
} else if (result.error) {
  process.stderr.write("PRODUCTION_OPPORTUNITY_RADAR_LAUNCH_FAILED\n");
  process.exitCode = 1;
} else {
  process.exitCode = result.status ?? 1;
}
