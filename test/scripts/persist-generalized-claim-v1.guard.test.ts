import test from "node:test";
import assert from "node:assert/strict";

import { parsePersistArgsV1 } from "../../scripts/persist-generalized-claim-v1";

test("persist-generalized-claim-v1: missing confirm fails closed (parse)", () => {
  const p = parsePersistArgsV1(["--evidence", "ev_x"]);
  assert.equal(p.evidence_reference_id, "ev_x");
  assert.equal(p.confirm, false);
});

test("persist-generalized-claim-v1: confirm flag parsed", () => {
  const p = parsePersistArgsV1(["--evidence", "ev_x", "--confirm-write"]);
  assert.equal(p.confirm, true);
});

