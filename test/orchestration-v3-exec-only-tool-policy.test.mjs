import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  buildIsolatedEnvironment,
  writeExecOnlyToolPolicy
} from "../scripts/orchestration-v3/diagnose-local-tool-observed.mjs";

test("V3 isolated workers mechanically deny filesystem tools while preserving exec", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jeeves-v3-exec-only-policy-"));
  const configPath = path.join(root, "openclaw.json");
  fs.writeFileSync(configPath, "{}\n", "utf8");

  const config = writeExecOnlyToolPolicy(configPath);
  assert.ok(config.tools.deny.includes("group:fs"));
  assert.equal(config.tools.deny.includes("exec"), false);

  const persisted = JSON.parse(fs.readFileSync(configPath, "utf8"));
  assert.ok(persisted.tools.deny.includes("group:fs"));
  assert.equal(persisted.tools.deny.includes("exec"), false);
});

test("V3 exec-only policy preserves existing config and is idempotent", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jeeves-v3-exec-only-policy-"));
  const configPath = path.join(root, "openclaw.json");
  fs.writeFileSync(configPath, JSON.stringify({
    tools: { deny: ["browser"] },
    custom: { keep: true }
  }) + "\n", "utf8");

  writeExecOnlyToolPolicy(configPath);
  const second = writeExecOnlyToolPolicy(configPath);

  assert.deepEqual(second.custom, { keep: true });
  assert.deepEqual(second.tools.deny, ["browser", "group:fs"]);
});

test("buildIsolatedEnvironment always applies the exec-only policy", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jeeves-v3-exec-only-env-"));
  const configPath = path.join(root, "openclaw.json");
  const tempHome = path.join(root, "home");
  const stateDir = path.join(root, "state");
  const controlWorkspace = path.join(root, "workspace");
  for (const dir of [tempHome, stateDir, controlWorkspace]) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(configPath, "{}\n", "utf8");

  const env = buildIsolatedEnvironment({
    baseEnv: {},
    tempHome,
    stateDir,
    configPath,
    controlWorkspace
  });

  const persisted = JSON.parse(fs.readFileSync(configPath, "utf8"));
  assert.ok(persisted.tools.deny.includes("group:fs"));
  assert.equal(env.OPENCLAW_CONFIG_PATH, configPath);
  assert.equal(env.OPENCLAW_WORKSPACE_DIR, controlWorkspace);
});
