import test from "node:test";
import assert from "node:assert/strict";

import { loadProductionSourceRegistryV1 } from "@/lib/external-intelligence/config/load-production-source-registry";
import { evaluateAndPersistDailyWatchdogV1 } from "@/lib/external-intelligence/orchestration/watchdog-persist";
import type { ExternalCollectionHealthRepository } from "@/lib/external-intelligence/orchestration/health.repository";

class FakeRepo {
  writes: unknown[][] = [];
  async upsertHealthRecords(records: unknown[]) {
    this.writes.push(records);
  }
}

test("watchdog persistence: evaluates all 24 sources and upserts once", async () => {
  const { file: registry } = loadProductionSourceRegistryV1();
  const ids = registry.sources.map((s) => s.source_id);

  const schedule_enabled_by_source_id = Object.fromEntries(ids.map((id) => [id, false]));
  const allowed_now_by_source_id = Object.fromEntries(ids.map((id) => [id, false]));
  const adapter_operational_by_source_id = Object.fromEntries(ids.map((id) => [id, false]));

  const repo = new FakeRepo();
  const records = await evaluateAndPersistDailyWatchdogV1({
    now_iso: "2026-08-05T00:00:00.000Z",
    schedule_enabled_by_source_id,
    allowed_now_by_source_id,
    adapter_operational_by_source_id,
    repo: repo as unknown as ExternalCollectionHealthRepository
  });

  assert.equal(records.length, 24);
  assert.equal(repo.writes.length, 1);
  assert.equal(repo.writes[0].length, 24);
});
