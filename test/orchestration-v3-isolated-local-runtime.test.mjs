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

test("isolated local config disables cloud-backed memory lifecycle with schema-safe keys", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "v3-memory-config-"));
  const configPath = path.join(dir, "openclaw.json");
  fs.writeFileSync(configPath, "{}\n", "utf8");

  const config = writeCloudMemoryDisabledConfig(configPath);
  assert.equal(config.plugins.slots.memory, "none");
  assert.equal(config.plugins.entries["memory-core"].enabled, false);
  assert.equal(config.plugins.entries["active-memory"].enabled, false);
  assert.equal(config.plugins.entries["active-memory"].config.mode, "off");
  assert.equal(config.memory.search.enabled, false);
  assert.equal(config.memory.search.rememberAcrossConversations, false);
  assert.deepEqual(config.memory.search.sources, ["memory"]);
  assert.equal(config.memory.search.experimental.sessionMemory, false);
  assert.equal(config.hooks.internal.entries["session-memory"].enabled, false);

  // Do not emit unsupported sentinel providers or legacy memory paths. The
  // isolated CLI must be able to validate this config before agent startup.
  assert.equal("provider" in config.memory.search, false);
  assert.equal("fallback" in config.memory.search, false);
  assert.equal("qmd" in config.memory, false);
  assert.equal("agents" in config, false);

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
      memory: { search: { enabled: false, rememberAcrossConversations: false, experimental: { sessionMemory: false } } },
      hooks: { internal: { entries: { "session-memory": { enabled: false } } } }
    }, {}),
    /ISOLATED_CLOUD_MEMORY_NOT_DISABLED/
  );
});
