const BROAD_PATTERNS = new Set(["*", "**", "**/*", ".", "./", "/"]);

function stripMarkdown(value) {
  return String(value ?? "")
    .trim()
    .replace(/^[-*]\s+/, "")
    .replace(/^`+|`+$/g, "")
    .trim();
}

export function normalizeOwnershipPattern(value) {
  let pattern = stripMarkdown(value).replaceAll("\\", "/");
  pattern = pattern.replace(/^\.\//, "").replace(/\/+/g, "/");
  if (!pattern || pattern.startsWith("/") || pattern.includes("../") || pattern === "..") return null;
  if (BROAD_PATTERNS.has(pattern)) return null;
  if (/^[a-z]+:\/\//i.test(pattern)) return null;
  if (/\s/.test(pattern)) return null;
  return pattern;
}

function splitOwnershipValue(value) {
  return String(value ?? "")
    .split(/\r?\n|,/)
    .map(stripMarkdown)
    .filter(Boolean)
    .flatMap((line) => line.startsWith("[") && line.endsWith("]")
      ? line.slice(1, -1).split(",").map(stripMarkdown)
      : [line]);
}

export function parseOwnershipPatterns(value) {
  const raw = splitOwnershipValue(value);
  const valid = [];
  const invalid = [];
  for (const item of raw) {
    const normalized = normalizeOwnershipPattern(item);
    if (normalized) valid.push(normalized);
    else invalid.push(item);
  }
  return {
    declared: raw.length > 0,
    valid: [...new Set(valid)].sort(),
    invalid: [...new Set(invalid)].sort()
  };
}

function wildcardIndex(pattern) {
  const indexes = [pattern.indexOf("*"), pattern.indexOf("?"), pattern.indexOf("[")].filter((index) => index >= 0);
  return indexes.length ? Math.min(...indexes) : -1;
}

function staticPrefix(pattern) {
  const index = wildcardIndex(pattern);
  const prefix = index < 0 ? pattern : pattern.slice(0, index);
  return prefix.replace(/[^/]*$/, "").replace(/\/$/, "");
}

function globToRegExp(pattern) {
  let out = "^";
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    if (char === "*") {
      if (pattern[index + 1] === "*") {
        index += 1;
        if (pattern[index + 1] === "/") {
          index += 1;
          out += "(?:.*/)?";
        } else {
          out += ".*";
        }
      } else {
        out += "[^/]*";
      }
    } else if (char === "?") {
      out += "[^/]";
    } else if (".+^${}()|[]\\".includes(char)) {
      out += `\\${char}`;
    } else {
      out += char;
    }
  }
  out += "$";
  return new RegExp(out);
}

function isGlob(pattern) {
  return wildcardIndex(pattern) >= 0;
}

export function ownershipPatternOverlaps(left, right) {
  const a = normalizeOwnershipPattern(left);
  const b = normalizeOwnershipPattern(right);
  if (!a || !b) return true;
  if (a === b) return true;

  const aGlob = isGlob(a);
  const bGlob = isGlob(b);
  if (!aGlob && !bGlob) return false;
  if (!aGlob) return globToRegExp(b).test(a);
  if (!bGlob) return globToRegExp(a).test(b);

  const aPrefix = staticPrefix(a);
  const bPrefix = staticPrefix(b);
  if (!aPrefix || !bPrefix) return true;
  if (aPrefix === bPrefix) return true;
  return aPrefix.startsWith(`${bPrefix}/`) || bPrefix.startsWith(`${aPrefix}/`);
}

export function ownershipSetsOverlap(left = [], right = []) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length === 0 || right.length === 0) return true;
  return left.some((a) => right.some((b) => ownershipPatternOverlaps(a, b)));
}

export function formatOwnershipPatterns(files = []) {
  const parsed = parseOwnershipPatterns(files.join(","));
  if (parsed.invalid.length > 0 || parsed.valid.length === 0) return null;
  return parsed.valid.join(", ");
}
