import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock Hoophall adapter to avoid network.
vi.mock("@/lib/external-intelligence/collection/hoophall/hoophall.adapter", () => ({
  collectHoophallNewsroomV1: vi.fn(async () => ({
    ok: true,
    source_id: "sports.basketball.hoophall.official",
    items: [
      {
        url: "https://www.hoophall.com/news/x",
        headline: "Enshrinement scheduled",
        listing_description: "The Enshrinement will take place on August 10, 2026.",
        published_at_iso: null
      }
    ]
  })),
  collectHoophallNewsroomDetailV1: vi.fn(async () => ({ ok: true, excerpt: null }))
}));

// Mock persistence layers.
const callLog: string[] = [];

vi.mock("@/lib/external-intelligence/persistence/supabase/evidence-reference.repository", () => ({
  EvidenceReferenceRepository: class {
    async persistEvidenceReference() {
      callLog.push("persistEvidence");
      return {
        ref: {
          object_type: "evidence_reference",
          object_id: "ev_x",
          version_id: null,
          content_hash: "0".repeat(64),
          schema_version: "evidence_reference_v1",
          policy_version: "p",
          created_at: "2026-08-08T00:00:00.000Z"
        }
      };
    }
  }
}));

vi.mock("@/lib/external-intelligence/persistence/supabase/claim.repository", () => ({
  ClaimRepository: class {
    async persistClaim() {
      callLog.push("persistClaim");
      return { ref: { object_type: "claim", object_id: "cl_x", version_id: null, content_hash: "0".repeat(64), schema_version: "claim_v1", policy_version: "p", created_at: "x" }, created_new_version: true, idempotent_replay: false };
    }
  }
}));

vi.mock("@/lib/external-intelligence/milestones/persistence/milestone.repository", () => ({
  SportsMilestoneRepository: class {
    async persistMilestone() {
      callLog.push("persistMilestone");
      return { milestone_id: "m", content_hash: "0".repeat(64), created_new_version: true, idempotent_replay: false };
    }
  }
}));

// Mock downstream qualifier to control qualification outcome.
vi.mock("@/lib/external-intelligence/qualification/downstream-qualification-v1", () => ({
  qualifyEvidenceReferenceDownstreamV1: vi.fn(() => {
    callLog.push("qualify");
    return { status: "qualified", reason_codes: [], claims: [{ claim_id: "c", evidence_reference_id: "ev_x" }], sports_milestones: [{ milestone_id: "m" }] };
  })
}));

import { runHoophallCollectionLaneV1 } from "@/lib/external-intelligence/orchestration/handlers/hoophall-collection-v1";
import { qualifyEvidenceReferenceDownstreamV1 } from "@/lib/external-intelligence/qualification/downstream-qualification-v1";

describe("downstream orchestration sequencing", () => {
  beforeEach(() => {
    callLog.length = 0;
    vi.clearAllMocks();
  });

  it("Hoophall: persists evidence, then qualifies once, then persists structured outputs", async () => {
    const out = await runHoophallCollectionLaneV1({ now_iso: "2026-08-08T00:00:00.000Z", mode: "one_shot" });
    expect(out.status).toBe("succeeded");

    expect(callLog[0]).toBe("persistEvidence");
    expect(callLog).toContain("qualify");
    expect(callLog.indexOf("qualify")).toBeGreaterThan(callLog.indexOf("persistEvidence"));
    expect(callLog).toContain("persistClaim");
    expect(callLog).toContain("persistMilestone");

    const q = qualifyEvidenceReferenceDownstreamV1 as unknown as { mock: { calls: unknown[] } };
    expect(q.mock.calls.length).toBe(1);
  });
});

