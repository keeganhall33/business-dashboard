import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const workerPath = path.join(here, "worker.mjs");
let source = fs.readFileSync(workerPath, "utf8");

const importAnchor = 'import { ORCHESTRATION_V3 } from "./config.mjs";';
const parserImport = 'import { extractOrchestrationResult } from "./result-contract.mjs";';
if (!source.includes(parserImport)) {
  if (!source.includes(importAnchor)) throw new Error("WORKER_IMPORT_ANCHOR_MISSING");
  source = source.replace(importAnchor, `${importAnchor}\n${parserImport}`);
}

if (source.includes("function extractFinalText(envelope)")) {
  const start = source.indexOf("function extractFinalText(envelope)");
  const endMarker = "function sanitizeCloudEnv(baseEnv)";
  const end = source.indexOf(endMarker, start);
  if (end < 0) throw new Error("WORKER_PARSER_END_ANCHOR_MISSING");
  source = source.slice(0, start) + source.slice(end);
}

const oldCall = `  const envelope = JSON.parse(String(run.stdout ?? ""));
  parsed = parseResult(extractFinalText(envelope));`;
const newCall = `  const envelope = JSON.parse(String(run.stdout ?? ""));
  const value = extractOrchestrationResult(envelope);
  parsed = { ...resultBase(value.STATUS, String(value.SUMMARY ?? "")), ...value };`;
if (source.includes(oldCall)) source = source.replace(oldCall, newCall);
else if (!source.includes("const value = extractOrchestrationResult(envelope);")) throw new Error("WORKER_PARSE_CALL_ANCHOR_MISSING");

fs.writeFileSync(workerPath, source, "utf8");
console.log(JSON.stringify({ status: "PASS", workerPath, parserImportPresent: source.includes(parserImport), parserCallPresent: source.includes("extractOrchestrationResult(envelope)") }));
