import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  resolveEntityRefV1,
  type ResolutionLinkRepoLikeV1
} from "@/lib/external-intelligence/entities/entity-ref-resolution-overlay-v1";
import type { EntityRef } from "@/lib/external-intelligence/contracts/entity-ref";

type ProductionClaimFixture = {
  claim_id: string;
  content_hash: string;
  schema_version: string;
  payload_json: Record<string, unknown>;
};

function loadFixture(name: string): ProductionClaimFixture {
  const here = dirname(fileURLToPath(import.meta.url));
  const p = join(here, "..", "fixtures", "external-intelligence", "production-claims", name);
  return JSON.parse(readFileSync(p, "utf8")) as ProductionClaimFixture;
}

const claim1 = loadFixture("claim-1.json");
const claim2 = loadFixture("claim-2.json");
const claim3 = loadFixture("claim-3.json");

function deepFreeze<T>(obj: T): T {
  if (obj && typeof obj === "object") {
    Object.freeze(obj);
    const rec = obj as unknown as Record<string, unknown>;
    for (const key of Object.keys(rec)) {
      deepFreeze(rec[key]);
    }
  }
  return obj;
}

async function assertClaimUnchangedAfterOverlay(input: ProductionClaimFixture) {
  const before = structuredClone(input);

  // Freeze to catch accidental mutation.
  deepFreeze(input);

  const subjectRef = input.payload_json.subject as unknown as EntityRef;
  const objectEntityRef = (input.payload_json.object as unknown as { entity: EntityRef } | undefined)?.entity as unknown as EntityRef;

  const r1 = await resolveEntityRefV1({
    entity_ref: subjectRef,
    deps: {
      linkRepo: {
        getResolvedByProvisionalId: async () => null
      } satisfies ResolutionLinkRepoLikeV1
    }
  });
  const r2 = await resolveEntityRefV1({
    entity_ref: objectEntityRef,
    deps: {
      linkRepo: {
        getResolvedByProvisionalId: async () => null
      } satisfies ResolutionLinkRepoLikeV1
    }
  });

  assert.equal(r1.resolution_status, "unresolved");
  assert.equal(r2.resolution_status, "unresolved");

  // Original claim payload (and outer identity fields) must remain identical.
  assert.deepEqual(input, before);
}

test("claim immutability: A24 partnered_with Google DeepMind", async () => {
  await assertClaimUnchangedAfterOverlay(claim1);
});

test("claim immutability: Premier Padel appointed Ten Toes", async () => {
  await assertClaimUnchangedAfterOverlay(claim2);
});

test("claim immutability: MI London appointed Ten Toes", async () => {
  await assertClaimUnchangedAfterOverlay(claim3);
});
