import test from "node:test";
import assert from "node:assert/strict";

import { loadWave1QualificationRecordsV1 } from "@/lib/external-intelligence/source-qualification/load-wave1";

test("wave1 qualification: exactly one record per wave1 source with evidence refs", () => {
  const { records, wave1_source_ids } = loadWave1QualificationRecordsV1();

  assert.equal(records.length, wave1_source_ids.length);

  const ids = records.map((r) => r.source_id);
  assert.deepEqual(ids.slice().sort(), [...wave1_source_ids].slice().sort());

  for (const r of records) {
    assert.ok(r.official_documentation_refs.length >= 1);
    assert.ok(r.evidence_refs.length >= 1);
    assert.match(r.qualification_content_hash, /^[a-f0-9]{64}$/);

    // Fail-closed: no source becomes enabled by qualification.
    assert.equal(r.recommended_collection_mode, "disabled");
  }
});
