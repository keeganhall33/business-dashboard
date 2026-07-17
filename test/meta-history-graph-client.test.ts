import test from "node:test";
import assert from "node:assert/strict";
import { GraphClient } from "../src/lib/meta-intel/graph-client.ts";

function createFetchSequence(sequence: Array<{ status: number; statusText?: string; headers?: Record<string, string>; body: unknown }>) {
  let calls = 0;
  const fetchImpl = async () => {
    const entry = sequence[Math.min(calls, sequence.length - 1)];
    calls += 1;
    return new Response(JSON.stringify(entry.body), {
      status: entry.status,
      statusText: entry.statusText,
      headers: new Headers(entry.headers ?? {})
    });
  };
  return { fetchImpl, getCallCount: () => calls };
}

test("fetchCollection aggregates pages and stops without next", async () => {
  const responses = [
    { status: 200, body: { data: [{ id: 1 }], paging: { next: "next" } }, headers: { "facebook-api-version": "v25.0" } },
    { status: 200, body: { data: [{ id: 2 }] }, headers: { "facebook-api-version": "v25.0" } }
  ];
  const sequence = createFetchSequence(responses);
  const client = new GraphClient({ accessToken: "token", fetchImpl: sequence.fetchImpl });
  const rows = await client.fetchCollection("act_1/insights", {}, { label: "insights_account" });
  assert.equal(rows.length, 2);
  assert.equal(sequence.getCallCount(), 2);
});

test("fetchCollection enforces max page guard", async () => {
  const responses = [
    { status: 200, body: { data: [{ id: 1 }], paging: { next: "next" } } }
  ];
  const sequence = createFetchSequence(responses);
  const client = new GraphClient({ accessToken: "token", maxPages: 1, fetchImpl: sequence.fetchImpl });
  await assert.rejects(
    () => client.fetchCollection("act_1/insights", {}, { label: "insights_account" }),
    /Exceeded max pages/ 
  );
});

test("GraphClient retries throttling/5xx responses", async () => {
  const responses = [
    { status: 500, body: { error: { message: "server" } } },
    { status: 200, body: { data: [{ id: 1 }] } }
  ];
  const sequence = createFetchSequence(responses);
  const client = new GraphClient({ accessToken: "token", fetchImpl: sequence.fetchImpl });
  const rows = await client.fetchCollection("act_1/insights", {}, { label: "insights_account" });
  assert.equal(rows.length, 1);
  assert.equal(sequence.getCallCount(), 2);
});

test("GraphClient does not retry ordinary 4xx errors", async () => {
  const responses = [
    { status: 400, statusText: "Bad Request", body: { error: { message: "bad request" } } }
  ];
  const sequence = createFetchSequence(responses);
  const client = new GraphClient({ accessToken: "token", fetchImpl: sequence.fetchImpl });
  await assert.rejects(
    () => client.fetchCollection("act_1/insights", {}, { label: "insights_account" }),
    /Graph API 400 Bad Request/
  );
  assert.equal(sequence.getCallCount(), 1);
});

test("access tokens are redacted in error messages", async () => {
  const responses = [
    {
      status: 400,
      statusText: "Bad Request",
      body: { error: { message: "Invalid access_token=shhh" } }
    }
  ];
  const sequence = createFetchSequence(responses);
  const client = new GraphClient({ accessToken: "token", fetchImpl: sequence.fetchImpl });
  await assert.rejects(
    () => client.fetchCollection("act_1/insights", {}, { label: "insights_account" }),
    /access_token=REDACTED/
  );
});

test("API version mismatch reported", async () => {
  const responses = [
    { status: 200, body: { data: [] }, headers: { "facebook-api-version": "v24.0" } }
  ];
  const sequence = createFetchSequence(responses);
  const client = new GraphClient({ accessToken: "token", fetchImpl: sequence.fetchImpl });
  await client.fetchCollection("act_1/insights", {}, { label: "insights_account" });
  assert.ok(client.getVersionWarnings().some((warning) => warning.includes("v24.0")));
});
