import fs from "node:fs";

const CLOUD_CREDENTIAL_PREFIXES = [
  "OPENAI_", "ANTHROPIC_", "CODEX_", "GOOGLE_", "GEMINI_", "XAI_", "MISTRAL_",
  "GROQ_", "DEEPSEEK_", "PERPLEXITY_", "OPENROUTER_", "COHERE_", "HUGGINGFACE_",
  "HF_", "TOGETHER_", "CEREBRAS_", "FIREWORKS_", "AZURE_", "BEDROCK_"
];

export function stripCloudCredentials(baseEnv = process.env) {
  const env = { ...baseEnv };
  for (const key of Object.keys(env)) {
    if (key.startsWith("OPENCLAW_")) delete env[key];
    if (
      CLOUD_CREDENTIAL_PREFIXES.some((prefix) => key.startsWith(prefix)) &&
      /(KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|AUTH)/i.test(key)
    ) {
      delete env[key];
    }
  }
  return env;
}

export function writeCloudMemoryDisabledConfig(configPath) {
  let config = {};
  try {
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, "utf8").trim();
      if (raw) config = JSON.parse(raw);
    }
  } catch {
    config = {};
  }

  const existingTools = config?.tools && typeof config.tools === "object" ? config.tools : {};
  const existingDeny = Array.isArray(existingTools.deny) ? existingTools.deny : [];

  config = {
    ...config,
    tools: {
      ...existingTools,
      deny: [...new Set([...existingDeny, "group:fs", "memory_search", "memory_get"])]
    },
    plugins: {
      ...(config.plugins ?? {}),
      slots: {
        ...(config.plugins?.slots ?? {}),
        memory: "none"
      },
      entries: {
        ...(config.plugins?.entries ?? {}),
        "memory-core": {
          ...(config.plugins?.entries?.["memory-core"] ?? {}),
          enabled: false
        },
        "active-memory": {
          ...(config.plugins?.entries?.["active-memory"] ?? {}),
          enabled: false,
          config: {
            ...(config.plugins?.entries?.["active-memory"]?.config ?? {}),
            enabled: false,
            mode: "off",
            persistTranscripts: false
          }
        }
      }
    },
    memory: {
      ...(config.memory ?? {}),
      search: {
        ...(config.memory?.search ?? {}),
        enabled: false,
        provider: "none",
        rememberAcrossConversations: false,
        fallback: "none",
        sources: ["memory"],
        experimental: {
          ...(config.memory?.search?.experimental ?? {}),
          sessionMemory: false
        }
      },
      qmd: {
        ...(config.memory?.qmd ?? {}),
        sessions: {
          ...(config.memory?.qmd?.sessions ?? {}),
          enabled: false
        }
      }
    },
    agents: {
      ...(config.agents ?? {}),
      defaults: {
        ...(config.agents?.defaults ?? {}),
        memorySearch: {
          ...(config.agents?.defaults?.memorySearch ?? {}),
          enabled: false,
          provider: "none",
          fallback: "none",
          sync: {
            ...(config.agents?.defaults?.memorySearch?.sync ?? {}),
            onSessionStart: false,
            onSearch: false,
            watch: false,
            intervalMinutes: 0
          }
        },
        compaction: {
          ...(config.agents?.defaults?.compaction ?? {}),
          postIndexSync: "off",
          memoryFlush: {
            ...(config.agents?.defaults?.compaction?.memoryFlush ?? {}),
            enabled: false
          }
        }
      }
    },
    hooks: {
      ...(config.hooks ?? {}),
      internal: {
        ...(config.hooks?.internal ?? {}),
        entries: {
          ...(config.hooks?.internal?.entries ?? {}),
          "session-memory": {
            ...(config.hooks?.internal?.entries?.["session-memory"] ?? {}),
            enabled: false
          }
        }
      }
    }
  };

  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  return config;
}

export function assertCloudMemoryDisabled(config, env = {}) {
  const violations = [];
  if (config?.plugins?.slots?.memory !== "none") violations.push("MEMORY_SLOT_NOT_NONE");
  if (config?.plugins?.entries?.["memory-core"]?.enabled !== false) violations.push("MEMORY_CORE_ENABLED");
  if (config?.plugins?.entries?.["active-memory"]?.enabled !== false) violations.push("ACTIVE_MEMORY_ENABLED");
  if (config?.memory?.search?.enabled !== false) violations.push("MEMORY_SEARCH_ENABLED");
  if (config?.memory?.search?.rememberAcrossConversations !== false) violations.push("CROSS_CONVERSATION_MEMORY_ENABLED");
  if (config?.memory?.qmd?.sessions?.enabled !== false) violations.push("QMD_SESSION_EXPORT_ENABLED");
  if (config?.agents?.defaults?.memorySearch?.enabled !== false) violations.push("AGENT_MEMORY_SEARCH_ENABLED");
  if (config?.agents?.defaults?.memorySearch?.sync?.onSessionStart !== false) violations.push("MEMORY_SESSION_START_SYNC_ENABLED");
  if (config?.agents?.defaults?.memorySearch?.sync?.watch !== false) violations.push("MEMORY_WATCH_ENABLED");
  if (config?.hooks?.internal?.entries?.["session-memory"]?.enabled !== false) violations.push("SESSION_MEMORY_HOOK_ENABLED");

  for (const key of Object.keys(env)) {
    if (
      CLOUD_CREDENTIAL_PREFIXES.some((prefix) => key.startsWith(prefix)) &&
      /(KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|AUTH)/i.test(key)
    ) {
      violations.push(`CLOUD_CREDENTIAL_PRESENT:${key}`);
    }
  }

  if (violations.length > 0) {
    const error = new Error(`ISOLATED_CLOUD_MEMORY_NOT_DISABLED:${violations.join(",")}`);
    error.code = "ISOLATED_CLOUD_MEMORY_NOT_DISABLED";
    error.violations = violations;
    throw error;
  }
  return true;
}
