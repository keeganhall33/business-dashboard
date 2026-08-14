import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const repo = "keeganhall33/business-dashboard";
const issue = "337";
const stateRoot = path.join(os.tmpdir(), `openclaw-local-d-probe-${process.pid}-${Date.now()}`);
const sessionId = `probe-local-d-${Date.now()}`;
const prompt = [
  "Return ONLY this single JSON object, with no prose and no code fence:",
  '{"TASK_ID":"337-probe","STATUS":"PASS","SUMMARY":"local json probe passed","CHANGES":[],"FILES_CHANGED":[],"DB_CHANGES":"NO","MIGRATION":null,"TESTS":"N/A","PR":null,"MERGE_STATUS":"N/A","PRODUCTION_CHANGE":"NO","UNEXPECTED_RESULTS":[],"DECISIONS_REQUIRED":[],"BLOCKERS":[],"NEXT_RECOMMENDED_TASK":null,"SESSION_HEALTH":"GOOD","SESSION_CONTEXT":"local-d-json-probe"}'
].join("\n");

function extractText(envelope) {
  const candidates = [
    envelope?.final,
    envelope?.text,
    envelope?.reply,
    envelope?.result?.final,
    envelope?.result?.text,
    envelope?.result?.reply,
    envelope?.meta?.agentMeta?.final,
    envelope?.result?.meta?.agentMeta?.final
  ];
  for (const c of candidates) if (typeof c === "string" && c.trim()) return c.trim();
  for (const payloads of [envelope?.payloads, envelope?.result?.payloads, envelope?.meta?.agentMeta?.payloads, envelope?.result?.meta?.agentMeta?.payloads]) {
    if (!Array.isArray(payloads)) continue;
    const joined = payloads.map((p) => typeof p?.text === "string" ? p.text : "").filter(Boolean).join("\n\n").trim();
    if (joined) return joined;
  }
  return "";
}

let raw = "";
let envelope = null;
let errText = null;
try {
  raw = execFileSync("/opt/homebrew/bin/openclaw", [
    "agent", "--local", "--session-id", sessionId, "--agent", "local-d",
    "--message", prompt, "--json", "--thinking", "minimal", "--timeout", "90"
  ], {
    encoding: "utf8",
    timeout: 150000,
    maxBuffer: 8 * 1024 * 1024,
    env: {
      ...process.env,
      OPENCLAW_STATE_DIR: stateRoot,
      OPENCLAW_CONFIG_PATH: process.env.OPENCLAW_CONFIG_PATH || path.join(os.homedir(), ".openclaw", "openclaw.json")
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  envelope = JSON.parse(raw);
} catch (err) {
  errText = String(err?.message ?? err).slice(0, 1200);
  if (typeof err?.stdout === "string" && err.stdout.trim()) {
    raw = err.stdout;
    try { envelope = JSON.parse(raw); } catch {}
  }
}

const finalText = extractText(envelope);
const meta = envelope?.meta?.agentMeta ?? envelope?.result?.meta?.agentMeta ?? envelope?.result?.agentMeta ?? null;
let finalJsonValid = false;
let finalKeys = [];
try {
  const obj = JSON.parse(finalText.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim());
  finalJsonValid = !!obj && typeof obj === "object";
  finalKeys = finalJsonValid ? Object.keys(obj).sort() : [];
} catch {}

const result = {
  PROBE: "LOCAL_D_DIRECT_NO_CLOUD",
  OPENCLAW_EXECUTION_ERROR: errText,
  MODEL: meta?.model ?? null,
  PROVIDER: meta?.provider ?? null,
  ENVELOPE_ROOT_KEYS: envelope && typeof envelope === "object" ? Object.keys(envelope).sort() : [],
  RESULT_KEYS: envelope?.result && typeof envelope.result === "object" ? Object.keys(envelope.result).sort() : [],
  FINAL_TEXT_JSON_VALID: finalJsonValid,
  FINAL_TEXT_KEYS: finalKeys,
  FINAL_TEXT_PREVIEW: finalText.slice(0, 1800),
  CLOUD_PATH_AVAILABLE: false,
  STATE_DIR_ISOLATED: true,
  SESSION_ID: sessionId
};

execFileSync("gh", ["issue", "comment", issue, "--repo", repo, "--body", [
  "## LocalDDirectJsonProbeV1",
  "",
  "```json",
  JSON.stringify(result, null, 2),
  "```"
].join("\n")], { stdio: "inherit", timeout: 30000 });

if (!finalJsonValid) process.exitCode = 1;
