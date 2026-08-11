function section(body: string, heading: string) {
  // Match "### Heading" blocks.
  const re = new RegExp(`^###\\s+${heading}\\s*$`, "im");
  const start = body.search(re);
  if (start < 0) return null;
  const afterHeading = body.slice(start).replace(re, "").trimStart();
  // Next heading or end.
  const next = afterHeading.search(/^###\s+/m);
  const chunk = next < 0 ? afterHeading : afterHeading.slice(0, next);
  return chunk.trim();
}

export function extractReferenceDelta(body: string) {
  return {
    reference: section(body, "Reference"),
    delta: section(body, "Delta"),
    goal: section(body, "Goal"),
    requirements: section(body, "Requirements"),
    constraints: section(body, "Constraints"),
    acceptance: section(body, "Acceptance criteria")
  };
}

