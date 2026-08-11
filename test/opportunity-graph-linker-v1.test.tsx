import test from "node:test";
import assert from "node:assert/strict";

import { linkOpportunityToGraph } from "../src/lib/opportunity-graph-linker-v1/linker";

test("opportunity graph linker v1: links by explicit claim id", () => {
  const links = linkOpportunityToGraph({
    opportunity: {
      id: "opp-1",
      name: "Test",
      organization: "Acme",
      notes_md: "Claim ID: external:claim:123@abc123def456",
      source: null
    },
    claimVersions: []
  });

  assert.ok(links.some((l) => l.target_type === "claim_version" && l.match_method === "explicit_id"));
});

test("opportunity graph linker v1: exact org name links only when unambiguous", () => {
  const claimVersions = [
    {
      claim_id: "c1",
      content_hash: "h1",
      created_at: "2026-08-10T00:00:00.000Z",
      payload_json: {
        predicate: "operates_event_program",
        subject: { canonical_name: "Premier Padel", canonical_id: "provisional:organization:855" },
        object: { kind: "literal", value: "tour" }
      }
    },
    {
      claim_id: "c2",
      content_hash: "h2",
      created_at: "2026-08-10T00:00:00.000Z",
      payload_json: {
        predicate: "operates_event_program",
        subject: { canonical_name: "Premier Padel", canonical_id: "provisional:organization:855" },
        object: { kind: "literal", value: "tour" }
      }
    }
  ];

  const links = linkOpportunityToGraph({
    opportunity: { id: "opp-1", name: "Premier Padel / Ten Toes", organization: "Premier Padel" },
    claimVersions
  });

  assert.ok(
    links.some((l) => l.target_type === "claim_version" && l.match_method === "exact_org_name"),
    "expected exact_org_name link"
  );
});

test("opportunity graph linker v1: ambiguous org name with multiple canonical ids does not link", () => {
  const claimVersions = [
    {
      claim_id: "c1",
      content_hash: "h1",
      payload_json: { predicate: "operates_event_program", subject: { canonical_name: "Acme", canonical_id: "org:1" } }
    },
    {
      claim_id: "c2",
      content_hash: "h2",
      payload_json: { predicate: "operates_event_program", subject: { canonical_name: "Acme", canonical_id: "org:2" } }
    }
  ];

  const links = linkOpportunityToGraph({
    opportunity: { id: "opp-1", name: "Acme Thing", organization: "Acme" },
    claimVersions
  });

  assert.ok(!links.some((l) => l.match_method === "exact_org_name"));
});

