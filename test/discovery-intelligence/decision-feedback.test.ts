import { test } from "node:test";
import assert from "node:assert/strict";
import { normalize } from "../../src/lib/outcome-learning/decision-feedback.js";

test("normalize empty input", () => {
  assert.deepEqual(normalize(""), { disposition: "UNKNOWN", reason: "UNKNOWN", valid: false });
});

test("normalize invalid disposition forces unknown reason", () => {
  assert.deepEqual(normalize("!@#$%"), { disposition: "UNKNOWN", reason: "UNKNOWN", valid: false });
  assert.deepEqual(normalize("invalidDisposition REJECTED"), { disposition: "UNKNOWN", reason: "UNKNOWN", valid: false });
});

test("normalize known dispositions preserve valid reasons", () => {
  assert.equal(normalize("ACCEPTED PREFERENCE").disposition, "ACCEPTED");
  assert.equal(normalize("REJECTED FEASIBILITY").reason, "FEASIBILITY");
  assert.equal(normalize("DEFERRED TIMING").disposition, "DEFERRED");
});

test("normalize known disposition with unknown reason stays UNKNOWN", () => {
  assert.deepEqual(normalize("ACCEPTED UNKNOWN"), { disposition: "ACCEPTED", reason: "UNKNOWN", valid: false });
});

test("normalize trims and uppercases input", () => {
  assert.equal(normalize(" accepted preference ").disposition, "ACCEPTED");
  assert.equal(normalize("accepted PREFERENCE").reason, "PREFERENCE");
});

test("normalize valid truth table for all disposition/reason combos", () => {
  const dispositions = ["ACCEPTED", "REJECTED", "DEFERRED"];
  const reasons = ["PREFERENCE", "FEASIBILITY", "TIMING", "EVIDENCE_DISAGREEMENT", "OTHER"];
  
  for (const disp of dispositions) {
    for (const rsn of reasons) {
      assert.deepEqual(normalize(`${disp} ${rsn}`), { disposition: disp, reason: rsn, valid: true });
    }
  }
});

test("normalize unknown disposition always has valid=false", () => {
  const invalidInputs = ["", "invalid", "!@#"];
  for (const input of invalidInputs) {
    const result = normalize(input);
    assert.equal(result.disposition, "UNKNOWN");
    assert.equal(result.reason, "UNKNOWN");
    assert.equal(result.valid, false);
  }
});

test("normalize underscore tokens handled as unknown disposition", () => {
  assert.deepEqual(normalize("ACCEPTED_"), { disposition: "UNKNOWN", reason: "UNKNOWN", valid: false });
  assert.deepEqual(normalize("_FEASIBILITY"), { disposition: "UNKNOWN", reason: "UNKNOWN", valid: false });
});

test("normalize rejected space-separated tokens handled correctly", () => {
  assert.equal(normalize("   ").valid, false);
  assert.equal(normalize("\t").valid, false);
  assert.equal(normalize("\n").valid, false);
});

test("normalize unknown reason with known disposition still returns that disposition", () => {
  assert.equal(normalize("ACCEPTED UNKNOWN").disposition, "ACCEPTED");
  assert.equal(normalize("REJECTED SOMETHING").valid, false);
});
