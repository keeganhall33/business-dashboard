// Phase B1: deterministic, read-only Wave 1 qualification report.
//
// Run:
//   node --import tsx scripts/wave1-source-qualification-report.mjs
//
// Safety: no network, no persistence.

import { loadWave1QualificationRecordsV1 } from "../src/lib/external-intelligence/source-qualification/load-wave1.ts";

export function generateWave1QualificationReport() {
  const { records } = loadWave1QualificationRecordsV1();

  const lines = [];
  lines.push("External Intelligence — Wave 1 Source Qualification Report (B1)");
  lines.push("");

  const counts = new Map();
  const bump = (k) => counts.set(k, (counts.get(k) ?? 0) + 1);

  for (const r of records) {
    bump(r.status);

    lines.push(`- ${r.source_id}`);
    lines.push(`  status=${r.status}`);
    lines.push(`  recommended_mode=${r.recommended_collection_mode}`);
    lines.push(`  access_method=${r.reviewed_access_method}`);
    lines.push(`  terms=${r.terms_access_review_status} review_by=${r.review_by}`);
    lines.push(`  auth_required=${r.authentication_required}`);
    lines.push(`  remaining_blockers=${r.remaining_blockers.join(",") || "none"}`);
    lines.push(`  qualification_hash=${r.qualification_content_hash}`);
    lines.push("");
  }

  lines.push("Summary");
  const keys = [...counts.keys()].sort((a, b) => a.localeCompare(b));
  for (const k of keys) lines.push(`  ${k}=${counts.get(k)}`);

  return lines.join("\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.stdout.write(generateWave1QualificationReport());
}
