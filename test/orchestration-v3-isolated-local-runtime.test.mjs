import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  assertCloudMemoryDisabled,
  stripCloudCredentials,
  writeCloudMemoryDisabledConfig
} from "../scripts/orchestration-v3/isolated-local-runtime.mjs";

test("isolated local config disables cloud-backed memory lifecycle", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "v3-memory-config-"));
  const configPath = path.join(dir, "openclaw.json");
  fs.writeFileSync(configPath, "{}\n", "utf8");

  const config = writeCloudMemoryDisabledConfig(configPath);
  assert.equal(config.plugins.slots.memory, "none");
  assert.equal(config.plugins.entries["memory-core"].enabled, false);
  assert.equal(config.plugins.entries["active-memory"].enabled, false);
  assert.equal(config.memory.search.enabled, false);
  assert.equal(config.memory.search.rememberAcrossConversations, false);
  assert.equal(config.memory.qmd.sessions.enabled, false);
  assert.equal(config.agents.defaults.memorySearch.enabled, false);
  assert.equal(config.agents.defaults.memorySearch.sync.onSessionStart, false);
  assert.equal(config.agents.defaults.memorySearch.sync.onSearch, false);
  assert.equal(config.agents.defaults.memorySearch.sync.watch, false);
  assert.equal(config.hooks.internal.entries["session-memory"].enabled, false);
  assert.doesNotThrow(() => assertCloudMemoryDisabled(config, {}));
});

test("cloud credentials are stripped while Ollama settings remain available", () => {
  const env = stripCloudCredentials({
    OPENAI_API_KEY: "secret",
    ANTHROPIC_API_KEY: "secret",
    GEMINI_API_KEY: "secret",
    OLLAMA_HOST: "http://127.0.0.1:11434",
    PATH: "/usr/bin"
  });

  assert.equal(env.OPENAI_API_KEY, undefined);
  assert.equal(env.ANTHROPIC_API_KEY, undefined);
  assert.equal(env.GEMINI_API_KEY, undefined);
  assert.equal(env.OLLAMA_HOST, "http://127.0.0.1:11434");
  assert.equal(env.PATH, "/usr/bin");
});

test("startup self-check fails closed when cloud memory is re-enabled", () => {
  assert.throws(
    () => assertCloudMemoryDisabled({
      plugins: { slots: { memory: "memory-core" }, entries: { "memory-core": { enabled: true }, "active-memory": { enabled: false } } },
      memory: { search: { enabled: false, rememberAcrossConversations: false }, qmd: { sessions: { enabled: false } } },
      agents: { defaults: { memorySearch: { enabled: false, sync: { onSessionStart: false, watch: false } } } },
      hooks: { internal: { entries: { "session-memory": { enabled: false } } } }
    }, {}),
    /ISOLATED_CLOUD_MEMORY_NOT_DISABLED/
  );
});
