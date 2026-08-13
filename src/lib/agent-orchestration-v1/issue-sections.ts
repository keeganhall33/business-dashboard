function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function section(body: string, headings: string[]) {
  // Match "### Heading" blocks with safe suffix variants like:
  // - ### Delta (AUTHORITATIVE)
  // - ### Acceptance Criteria (v1)
  // Case-insensitive. Deterministic: first match wins.
  const patterns = headings.map((h) => `^###\\s+${escapeRe(h)}(?:\\s*\\([^\n]*\\))?\\s*$`);
  const re = new RegExp(patterns.join("|"), "im");
  const start = body.search(re);
  if (start < 0) return null;

  const afterHeading = body.slice(start).replace(re, "").trimStart();
  // Next heading or end.
  const next = afterHeading.search(/^###\s+/m);
  const chunk = next < 0 ? afterHeading : afterHeading.slice(0, next);
  return chunk.trim() || null;
}

export function extractReferenceDelta(body: string) {
  return {
    reference: section(body, ["Reference"]),
    delta: section(body, ["Delta"]),
    goal: section(body, ["Goal"]),
    requirements: section(body, ["Requirements"]),
    constraints: section(body, ["Constraints"]),
    acceptance: section(body, ["Acceptance criteria", "Acceptance Criteria"])
  };
}
