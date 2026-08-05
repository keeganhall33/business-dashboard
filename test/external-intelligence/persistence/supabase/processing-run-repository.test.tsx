/* eslint-disable @typescript-eslint/no-explicit-any */
import test from "node:test";
import assert from "node:assert/strict";

import { ProcessingRunRepository } from "@/lib/external-intelligence/persistence/supabase/processing-run.repository";
import { EXTERNAL_INTELLIGENCE_RPCS } from "@/lib/external-intelligence/persistence/supabase/transactions";
import {
  PersistenceRunCompletionBlockedError,
  PersistenceUnknownDatabaseError
} from "@/lib/external-intelligence/persistence/errors";
import { MockSupabaseClient } from "./_mock-supabase";

test("ProcessingRun: completion uses complete_external_processing_run_v1 only", async () => {
  const mock = new MockSupabaseClient();
  mock.onRpc(EXTERNAL_INTELLIGENCE_RPCS.completeRun, () => ({ error: null, data: [{ run_id: "r1", resulting_status: "completed" }] }));

  const repo = new ProcessingRunRepository();
  const res = await repo.completeProcessingRun("r1", { client: mock as any });

  assert.equal(mock.rpcCalls.length, 1);
  assert.equal(mock.rpcCalls[0]!.fn, EXTERNAL_INTELLIGENCE_RPCS.completeRun);
  assert.deepEqual(res, { run_id: "r1", resulting_status: "completed" });
});

test("ProcessingRun: incomplete_write_set mapped", async () => {
  const mock = new MockSupabaseClient();
  mock.onRpc(EXTERNAL_INTELLIGENCE_RPCS.completeRun, () => ({ error: { message: "incomplete_write_set" }, data: null }));

  const repo = new ProcessingRunRepository();
  await assert.rejects(() => repo.completeProcessingRun("r1", { client: mock as any }), (err: any) => err instanceof PersistenceRunCompletionBlockedError);
});

test("ProcessingRun: run_completion_blocked mapped", async () => {
  const mock = new MockSupabaseClient();
  mock.onRpc(EXTERNAL_INTELLIGENCE_RPCS.completeRun, () => ({ error: { message: "run_completion_blocked" }, data: null }));

  const repo = new ProcessingRunRepository();
  await assert.rejects(() => repo.completeProcessingRun("r1", { client: mock as any }), (err: any) => err instanceof PersistenceRunCompletionBlockedError);
});

test("ProcessingRun: unknown database failures map to typed unknown-db error", async () => {
  const mock = new MockSupabaseClient();
  mock.onRpc(EXTERNAL_INTELLIGENCE_RPCS.completeRun, () => ({ error: { message: "some_internal" }, data: null }));

  const repo = new ProcessingRunRepository();
  await assert.rejects(() => repo.completeProcessingRun("r1", { client: mock as any }), (err: any) => err instanceof PersistenceUnknownDatabaseError);
});
