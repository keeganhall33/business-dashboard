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

test("opportunity graph linker v1: exact org name links only when one canonical identity is proven", () => {
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

  assert.equal(links.filter((l) => l.match_method === "exact_org_name").length, 2);
  assert.ok(
    links.every((l) => l.match_method !== "exact_org_name" || l.metadata?.subject_canonical_id === "provisional:organization:855")
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

test("opportunity graph linker v1: name-only claim subjects do not establish relationship graph identity", () => {
  const links = linkOpportunityToGraph({
    opportunity: { id: "opp-1", name: "Acme Opportunity", organization: "Acme" },
    claimVersions: [
      {
        claim_id: "name-only",
        content_hash: "h-name-only",
        payload_json: {
          predicate: "operates_event_program",
          subject: { canonical_name: "Acme" }
        }
      }
    ]
  });

  assert.ok(!links.some((l) => l.match_method === "exact_org_name"));
});

test("opportunity graph linker v1: mixed canonical and name-only rows link only the canonically identified claim", () => {
  const links = linkOpportunityToGraph({
    opportunity: { id: "opp-1", name: "Acme Opportunity", organization: "Acme" },
    claimVersions: [
      {
        claim_id: "canonical",
        content_hash: "h-canonical",
        payload_json: {
          predicate: "operates_event_program",
          subject: { canonical_name: "Acme", canonical_id: "org:acme" }
        }
      },
      {
        claim_id: "name-only",
        content_hash: "h-name-only",
        payload_json: {
          predicate: "has_program_surface",
          subject: { canonical_name: "Acme" }
        }
      }
    ]
  });

  const exact = links.filter((l) => l.match_method === "exact_org_name");
  assert.equal(exact.length, 1);
  assert.equal(exact[0]?.target_id, "canonical");
  assert.equal(exact[0]?.metadata?.subject_canonical_id, "org:acme");
});

test("opportunity graph linker v1: alias matching also requires canonical identity proof", () => {
  const links = linkOpportunityToGraph({
    opportunity: { id: "opp-1", name: "Acme", organization: null },
    claimVersions: [
      {
        claim_id: "name-only",
        content_hash: "h-name-only",
        payload_json: {
          predicate: "operates_event_program",
          subject: "Acme"
        }
      }
    ]
  });

  assert.ok(!links.some((l) => l.match_method === "alias_unambiguous"));
});
