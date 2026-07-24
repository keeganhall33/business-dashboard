import { test } from "node:test";
import assert from "node:assert/strict";
import { upsertOpportunity } from "@/lib/supabase/opportunityWriter";

class FakeTable {
  constructor(private response: unknown) {}
  payload: any;
  options: any;
  upsert(payload: any, options: any) {
    this.payload = payload;
    this.options = options;
    return {
      select: () => ({
        single: async () => ({ data: this.response, error: null })
      })
    };
  }
}

class FakeClient {
  table?: string;
  tableHandler?: FakeTable;
  constructor(private response: unknown) {}
  from(table: string) {
    this.table = table;
    this.tableHandler = new FakeTable(this.response);
    return this.tableHandler;
  }
}

test("upsertOpportunity uses natural_key conflict target", async () => {
  const response = { id: "abc" };
  const client = new FakeClient(response);
  const result = await upsertOpportunity(client as any, {
    name: "Upper Deck Hall of Fame capsule",
    organization: "Upper Deck",
    opportunityType: "licensing",
    status: "researching",
    ownerAgent: "noah"
  });

  assert.deepEqual(result, response);
  assert.equal(client.table, "opportunity_pipeline");
  assert.equal(client.tableHandler?.options?.onConflict, "natural_key");
  assert.equal(
    client.tableHandler?.payload?.natural_key,
    "c1bda423cfbc34f92a9c1eccf11abc59264b311d0802b33a36c41ab592b1c8bc"
  );
});
