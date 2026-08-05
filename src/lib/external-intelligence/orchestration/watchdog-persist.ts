import "@/lib/server-only";

import type { SourceHealthRecord } from "@/lib/external-intelligence/orchestration/watchdog";
import { evaluateDailyWatchdogV1 } from "@/lib/external-intelligence/orchestration/watchdog";
import { ExternalCollectionHealthRepository } from "@/lib/external-intelligence/orchestration/health.repository";

export async function evaluateAndPersistDailyWatchdogV1(input: {
  now_iso: string;
  schedule_enabled_by_source_id: Record<string, boolean>;
  allowed_now_by_source_id: Record<string, boolean>;
  adapter_operational_by_source_id: Record<string, boolean>;
  repo?: ExternalCollectionHealthRepository;
}): Promise<SourceHealthRecord[]> {
  const records = evaluateDailyWatchdogV1({
    now_iso: input.now_iso,
    schedule_enabled_by_source_id: input.schedule_enabled_by_source_id,
    allowed_now_by_source_id: input.allowed_now_by_source_id,
    adapter_operational_by_source_id: input.adapter_operational_by_source_id
  });

  const repo = input.repo ?? new ExternalCollectionHealthRepository();
  await repo.upsertHealthRecords(records);
  return records;
}
