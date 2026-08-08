import { describe, expect, it } from "vitest";

import fs from "node:fs";
import path from "node:path";

describe("dry-run script guard: no persistence imports", () => {
  it("script does not import persistence repositories or scheduler mutation", () => {
    const p = path.join(process.cwd(), "scripts/dry-run-generalized-claims-boardroom-v1.ts");
    const text = fs.readFileSync(p, "utf8");

    // Hard disallow known write-path imports.
    const disallowed = [
      "ClaimRepository",
      "SportsMilestoneRepository",
      "EvidenceReferenceRepository",
      "persist_external_claim",
      "persist_external_signal",
      "enqueue",
      "enable_external",
      "disable_external",
      "external_collection_jobs"
    ];

    for (const s of disallowed) {
      expect(text.includes(s)).toBe(false);
    }
  });
});
