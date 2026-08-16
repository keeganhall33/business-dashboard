const VALID_STATUSES = new Set(["PASS", "BLOCKED", "FAILED"]);
const AUTHORITATIVE_KEYS = ["finalAssistantVisibleText", "finalAssistantRawText", "final"];
const GENERIC_KEYS = ["text", "reply"];

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeContract(value) {
  if (!isObject(value)) throw new Error("INVALID_ORCHESTRATION_RESULT");
  const status = String(value.STATUS ?? "").toUpperCase();
  if (!VALID_STATUSES.has(status)) throw new Error("INVALID_ORCHESTRATION_RESULT_STATUS");
  return { ...value, STATUS: status };
}

function balancedJsonObjects(text) {
  const input = String(text ?? "");
  const objects = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") {
      if (depth === 0) start = i;
      depth += 1;
    } else if (ch === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        objects.push(input.slice(start, i + 1));
        start = -1;
      }
    }
  }
  return objects;
}

function parseCandidatesFromText(text) {
  const raw = String(text ?? "").trim();
  if (!raw) return [];
  const candidateStrings = new Set([raw]);
  const fenced = raw.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi);
  for (const match of fenced) candidateStrings.add(match[1].trim());
  for (const objectText of balancedJsonObjects(raw)) candidateStrings.add(objectText.trim());

  const valid = [];
  for (const candidate of candidateStrings) {
    try {
      valid.push(normalizeContract(JSON.parse(candidate)));
    } catch {
      // Ignore non-contract candidates; caller fails closed if none remain.
    }
  }
  const unique = new Map(valid.map((value) => [JSON.stringify(value), value]));
  return [...unique.values()];
}

function collectStrings(envelope, keys) {
  const seen = new Set();
  const values = [];
  function walk(value) {
    if (!value || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    for (const key of keys) {
      if (typeof value[key] === "string" && value[key].trim()) values.push(value[key].trim());
    }
    for (const child of Object.values(value)) walk(child);
  }
  walk(envelope);
  return values;
}

export function parseOrchestrationResultText(text) {
  const candidates = parseCandidatesFromText(text);
  if (candidates.length === 0) throw new Error("NO_VALID_ORCHESTRATION_RESULT");
  if (candidates.length > 1) throw new Error("AMBIGUOUS_ORCHESTRATION_RESULTS");
  return candidates[0];
}

export function extractOrchestrationResult(envelope) {
  const authoritativeTexts = collectStrings(envelope, AUTHORITATIVE_KEYS);
  const authoritative = authoritativeTexts.flatMap(parseCandidatesFromText);
  const authoritativeUnique = new Map(authoritative.map((value) => [JSON.stringify(value), value]));
  if (authoritativeUnique.size === 1) return [...authoritativeUnique.values()][0];
  if (authoritativeUnique.size > 1) throw new Error("AMBIGUOUS_AUTHORITATIVE_ORCHESTRATION_RESULTS");

  const genericTexts = collectStrings(envelope, GENERIC_KEYS);
  const generic = genericTexts.flatMap(parseCandidatesFromText);
  const genericUnique = new Map(generic.map((value) => [JSON.stringify(value), value]));
  if (genericUnique.size === 1) return [...genericUnique.values()][0];
  if (genericUnique.size > 1) throw new Error("AMBIGUOUS_ORCHESTRATION_RESULTS");
  throw new Error("NO_VALID_ORCHESTRATION_RESULT");
}
