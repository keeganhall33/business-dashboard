import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFirstPartyBusinessMemoryEvidenceRecordsV1,
  buildFirstPartyBusinessMemoryEvidenceViewModelV1
} from "@/lib/executive-memory/first-party-evidence/adapter";
import {
  FIRST_PARTY_BUSINESS_HISTORY_INPUT_FIXTURES_V1,
  FIRST_PARTY_BUSINESS_MEMORY_EVIDENCE_RECORD_FIXTURES_V1,
  FIRST_PARTY_BUSINESS_MEMORY_EVIDENCE_VIEW_MODEL_FIXTURE_V1
} from "@/lib/executive-memory/first-party-evidence/fixtures";

test("canonical memory evidence preserves source type, provenance, and source/effective time", () => {
  const records = FIRST_PARTY_BUSINESS_MEMORY_EVIDENCE_RECORD_FIXTURES_V1;
  const communication = records.find((record) => record.source_record_id === "communication-host-intro-2026-08-20");
  const correction = records.find((record) => record.source_record_id === "communication-host-intro-correction-2026-08-21");

  assert.ok(communication);
  assert.ok(correction);
  assert.equal(communication.contract_version, "first_party_business_memory_evidence_v1.0");
  assert.equal(communication.source_type, "COMMUNICATION");
  assert.equal(communication.source_timestamp, "2026-08-20T12:00:00.000Z");
  assert.equal(communication.effective_timestamp, "2026-08-20T12:00:00.000Z");
  assert.equal(communication.provenance.kind, "HUMAN_REPORTED");
  assert.equal(communication.provenance.authorized_read_only, true);
  assert.equal(communication.provenance.private_source_connected, false);
  assert.equal(communication.provenance.durable_write_allowed, false);
  assert.equal(correction.source_timestamp, "2026-08-21T12:00:00.000Z");
  assert.equal(correction.effective_timestamp, "2026-08-20T12:00:00.000Z");
});

test("UNKNOWN STALE and CONFLICTED stay explicit and never become zero or false", () => {
  const records = FIRST_PARTY_BUSINESS_MEMORY_EVIDENCE_RECORD_FIXTURES_V1;
  const unknown = records.find((record) => record.truth_state === "UNKNOWN");
  const stale = records.find((record) => record.truth_state === "STALE");
  const conflicted = records.find((record) => record.truth_state === "CONFLICTED");
  const viewModel = FIRST_PARTY_BUSINESS_MEMORY_EVIDENCE_VIEW_MODEL_FIXTURE_V1;

  assert.ok(unknown);
  assert.ok(stale);
  assert.ok(conflicted);
  assert.equal(unknown.observed_value, null);
  assert.notEqual(unknown.observed_value, "0");
  assert.notEqual(unknown.observed_value, "false");
  assert.equal(stale.freshness_state, "STALE");
  assert.equal(conflicted.evidence_quality, "CONFLICTED");
  assert.equal(viewModel.dashboard_flags.unknown_stale_conflicted_visible, true);
  assert.equal(viewModel.dashboard_flags.unknown_cannot_be_zero_or_false, true);
});

test("newer correction supersedes without erasing historical evidence", () => {
  const records = FIRST_PARTY_BUSINESS_MEMORY_EVIDENCE_RECORD_FIXTURES_V1;
  const original = records.find((record) => record.source_record_id === "communication-host-intro-2026-08-20");
  const correction = records.find((record) => record.source_record_id === "communication-host-intro-correction-2026-08-21");
  const viewModel = FIRST_PARTY_BUSINESS_MEMORY_EVIDENCE_VIEW_MODEL_FIXTURE_V1;

  assert.ok(original);
  assert.ok(correction);
  assert.equal(original.lifecycle, "SUPERSEDED");
  assert.equal(original.superseded_by_evidence_id, correction.evidence_id);
  assert.equal(correction.lifecycle, "ACTIVE");
  assert.deepEqual(correction.supersedes_evidence_ids, [original.evidence_id]);
  assert.match(correction.correction_reason ?? "", /marks decision-maker reach conflicted/);
  assert.ok(viewModel.records.some((record) => record.evidence_id === original.evidence_id));
  assert.equal(viewModel.supersession.prior_history_preserved, true);
  assert.equal(viewModel.dashboard_flags.correction_preserves_history, true);
});

test("Decision Room packet is compact and preserves current decision evidence states", () => {
  const packet = FIRST_PARTY_BUSINESS_MEMORY_EVIDENCE_VIEW_MODEL_FIXTURE_V1.decision_room_packet;
  const states = new Set(packet.evidence_rows.map((row) => row.state));

  assert.equal(packet.decision_id, "decision-private-collector-room");
  assert.ok(packet.evidence_rows.length >= 5);
  assert.ok(states.has("UNKNOWN"));
  assert.ok(states.has("STALE"));
  assert.ok(states.has("CONFLICTED"));
  assert.ok(packet.evidence_rows.every((row) => row.source_timestamp.length > 0 && row.effective_timestamp.length > 0));
  assert.ok(packet.evidence_rows.some((row) => row.provenance_kind === "HUMAN_CORRECTION"));
});

test("prior decision precedent can inform current decision without becoming a binding rule", () => {
  const precedent = FIRST_PARTY_BUSINESS_MEMORY_EVIDENCE_VIEW_MODEL_FIXTURE_V1.decision_room_packet.prior_decision_precedent;

  assert.ok(precedent);
  assert.equal(precedent.precedent_id, "precedent-private-preview-qualified-access-success");
  assert.equal(precedent.relevance, "HIGH");
  assert.equal(precedent.can_inform_current_decision, true);
  assert.equal(precedent.can_become_binding_rule, false);
  assert.match(precedent.lesson, /bounded private validation/i);
});

test("adapter replay is deterministic and fixture-only with no production writes", () => {
  const replayRecords = buildFirstPartyBusinessMemoryEvidenceRecordsV1(FIRST_PARTY_BUSINESS_HISTORY_INPUT_FIXTURES_V1);
  const replayViewModel = buildFirstPartyBusinessMemoryEvidenceViewModelV1({
    records: replayRecords,
    decisionId: "decision-private-collector-room"
  });

  assert.deepEqual(replayRecords, FIRST_PARTY_BUSINESS_MEMORY_EVIDENCE_RECORD_FIXTURES_V1);
  assert.deepEqual(replayViewModel, FIRST_PARTY_BUSINESS_MEMORY_EVIDENCE_VIEW_MODEL_FIXTURE_V1);
  assert.equal(replayViewModel.source_mode, "DETERMINISTIC_FIXTURE");
  assert.equal(replayViewModel.dashboard_flags.no_private_source_connection, true);
  assert.equal(replayViewModel.dashboard_flags.no_durable_write, true);
  assert.equal(replayViewModel.dashboard_flags.keegan_action_required, "NO");
});
