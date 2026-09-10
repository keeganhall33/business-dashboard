import assert from "node:assert/strict";
import test from "node:test";

import type { IonosMailboxRuntimeV1 } from "@/lib/email/ionos-mailbox-config-v1";
import {
  normalizeEmailIngestCandidatesV1,
  syncIonosMailboxesV1,
  type EmailCursorStoreV1,
  type EmailMetadataV1,
  type EmailProviderAdapterV1,
  type EmailReadStatusV1,
  type EmailSyncCursorV1
} from "@/lib/email/ionos-incremental-sync-v1";

const mailboxes: IonosMailboxRuntimeV1[] = [
  {
    id: "personal",
    role: "PERSONAL_HIGH_VALUE_RELATIONSHIP",
    user: "personal@example.test",
    pass: "fixture-a",
    host: "imap.ionos.com",
    port: 993,
    folder: "INBOX",
    minVersion: "TLSv1.2",
    smtpEnabled: false
  },
  {
    id: "assistant",
    role: "ASSISTANT_CUSTOMER_SERVICE_OUTREACH",
    user: "assistant@example.test",
    pass: "fixture-b",
    host: "imap.ionos.com",
    port: 993,
    folder: "INBOX",
    minVersion: "TLSv1.2",
    smtpEnabled: false
  },
  {
    id: "marketing",
    role: "MARKETING_FUNNELKIT",
    user: "marketing@example.test",
    pass: "fixture-c",
    host: "imap.ionos.com",
    port: 993,
    folder: "INBOX",
    minVersion: "TLSv1.3",
    smtpEnabled: false
  }
];

function cursor(mailboxId: string, uidValidity = "7", lastSeenUid = "10"): EmailSyncCursorV1 {
  return {
    mailboxId,
    uidValidity,
    lastSeenUid,
    updatedAt: "2026-09-08T12:00:00.000Z"
  };
}

class MemoryCursorStore implements EmailCursorStoreV1 {
  readonly values = new Map<string, EmailSyncCursorV1>();
  readonly commits: Array<{
    mailboxId: string;
    expected: EmailSyncCursorV1 | null;
    next: EmailSyncCursorV1;
  }> = [];
  rejectMailboxId: string | null = null;

  constructor(initial: EmailSyncCursorV1[] = []) {
    for (const value of initial) this.values.set(value.mailboxId, structuredClone(value));
  }

  async read(mailboxId: string): Promise<EmailSyncCursorV1 | null> {
    const value = this.values.get(mailboxId);
    return value == null ? null : structuredClone(value);
  }

  async compareAndSet(
    mailboxId: string,
    expected: EmailSyncCursorV1 | null,
    next: EmailSyncCursorV1
  ): Promise<boolean> {
    this.commits.push({
      mailboxId,
      expected: expected == null ? null : structuredClone(expected),
      next: structuredClone(next)
    });

    if (mailboxId === this.rejectMailboxId) return false;
    const current = this.values.get(mailboxId) ?? null;
    if (JSON.stringify(current) !== JSON.stringify(expected)) return false;
    this.values.set(mailboxId, structuredClone(next));
    return true;
  }
}

type AdapterScenario = {
  status: EmailReadStatusV1;
  messages?: EmailMetadataV1[];
  complete?: boolean;
  openFailures?: number;
};

function makeAdapter(scenarios: Record<string, AdapterScenario>) {
  const opens: string[] = [];
  const closes: string[] = [];
  const fetches: Array<{
    mailboxId: string;
    fromUid: string;
    toUid: string;
    limit: number;
  }> = [];
  const remainingFailures = new Map(
    Object.entries(scenarios).map(([id, scenario]) => [id, scenario.openFailures ?? 0])
  );

  const adapter: EmailProviderAdapterV1 = {
    async openReadOnly(mailbox, context) {
      opens.push(mailbox.id);
      assert.equal(Number.isSafeInteger(context.deadlineAtMs), true);

      const failures = remainingFailures.get(mailbox.id) ?? 0;
      if (failures > 0) {
        remainingFailures.set(mailbox.id, failures - 1);
        throw new Error(`provider leaked ${mailbox.user} ${mailbox.pass}`);
      }

      const scenario = scenarios[mailbox.id];
      if (!scenario) throw new Error("missing scenario");

      return {
        async status() {
          return structuredClone(scenario.status);
        },
        async fetchMetadata(input) {
          fetches.push({ mailboxId: mailbox.id, ...input });
          return {
            complete: scenario.complete ?? true,
            messages: structuredClone(scenario.messages ?? [])
          };
        },
        async close() {
          closes.push(mailbox.id);
        }
      };
    }
  };

  return { adapter, opens, closes, fetches };
}

function scenarios(
  status: EmailReadStatusV1 = { uidValidity: "7", uidNext: "11" }
): Record<string, AdapterScenario> {
  return Object.fromEntries(mailboxes.map((mailbox) => [mailbox.id, { status }]));
}

const fixedNow = () => Date.parse("2026-09-08T13:30:00.000Z");
const noSleep = async () => {};

test("establishes independent initial cursors for all three resolved mailbox roles without ingesting history", async () => {
  const store = new MemoryCursorStore();
  const provider = makeAdapter(scenarios({ uidValidity: 90071992547409930n, uidNext: 21n }));

  const results = await syncIonosMailboxesV1({
    mailboxes,
    adapter: provider.adapter,
    cursorStore: store,
    now: fixedNow,
    sleep: noSleep
  });

  assert.deepEqual(results.map((result) => result.status), ["BASELINED", "BASELINED", "BASELINED"]);
  assert.deepEqual(results.map((result) => result.candidateCount), [0, 0, 0]);
  assert.deepEqual(provider.fetches, []);
  assert.deepEqual(
    mailboxes.map((mailbox) => store.values.get(mailbox.id)?.lastSeenUid),
    ["20", "20", "20"]
  );
  assert.deepEqual(
    mailboxes.map((mailbox) => store.values.get(mailbox.id)?.uidValidity),
    ["90071992547409930", "90071992547409930", "90071992547409930"]
  );
});

test("fetches only the bounded new UID range and emits stable sorted candidate identities", async () => {
  const store = new MemoryCursorStore(mailboxes.map((mailbox) => cursor(mailbox.id)));
  const provider = makeAdapter({
    personal: {
      status: { uidValidity: "7", uidNext: "16" },
      messages: [
        { uid: "12", messageId: "<twelve@example.test>", internalDate: "2026-09-08T13:02:00Z", size: 22 },
        { uid: 11n, messageId: "<eleven@example.test>", internalDate: new Date("2026-09-08T13:01:00Z"), size: 11 }
      ]
    },
    assistant: { status: { uidValidity: "7", uidNext: "11" } },
    marketing: { status: { uidValidity: "7", uidNext: "11" } }
  });

  const results = await syncIonosMailboxesV1({
    mailboxes,
    adapter: provider.adapter,
    cursorStore: store,
    options: { batchSize: 2 },
    now: fixedNow,
    sleep: noSleep
  });

  assert.deepEqual(provider.fetches, [
    { mailboxId: "personal", fromUid: "11", toUid: "12", limit: 2 }
  ]);
  assert.equal(results[0]?.status, "SYNCED");
  assert.deepEqual(results[0]?.candidates.map((candidate) => candidate.uid), ["11", "12"]);
  assert.deepEqual(results[0]?.candidates.map((candidate) => candidate.id), [
    "ionos:personal:7:11",
    "ionos:personal:7:12"
  ]);
  assert.equal(store.values.get("personal")?.lastSeenUid, "12");
  assert.deepEqual(results.slice(1).map((result) => result.status), ["NO_NEW_MAIL", "NO_NEW_MAIL"]);
});

test("shared candidate normalizer preserves incremental identity, large UID precision, and null metadata", () => {
  const mailbox = mailboxes[0]!;
  const uid = "90071992547409931";
  const candidates = normalizeEmailIngestCandidatesV1(
    [{ uid, messageId: null, internalDate: null, size: null }],
    mailbox,
    "90071992547409930",
    BigInt(uid),
    BigInt(uid)
  );

  assert.deepEqual(candidates, [{
    id: `ionos:${mailbox.id}:90071992547409930:${uid}`,
    mailboxId: mailbox.id,
    role: mailbox.role,
    uidValidity: "90071992547409930",
    uid,
    messageId: null,
    internalDate: null,
    size: null
  }]);
});

test("repeated no-new-mail runs emit no duplicate candidates or cursor commits", async () => {
  const store = new MemoryCursorStore(mailboxes.map((mailbox) => cursor(mailbox.id)));
  const provider = makeAdapter(scenarios());

  const first = await syncIonosMailboxesV1({
    mailboxes,
    adapter: provider.adapter,
    cursorStore: store,
    now: fixedNow,
    sleep: noSleep
  });
  const second = await syncIonosMailboxesV1({
    mailboxes,
    adapter: provider.adapter,
    cursorStore: store,
    now: fixedNow,
    sleep: noSleep
  });

  assert.deepEqual(first.map((result) => result.reason), [
    "NO_NEW_MESSAGES",
    "NO_NEW_MESSAGES",
    "NO_NEW_MESSAGES"
  ]);
  assert.deepEqual(second.map((result) => result.candidates), [[], [], []]);
  assert.equal(store.commits.length, 0);
  assert.equal(provider.fetches.length, 0);
});

test("UIDVALIDITY changes invalidate the old cursor and establish a no-ingest baseline", async () => {
  const store = new MemoryCursorStore(
    mailboxes.map((mailbox) => cursor(mailbox.id, "7", "100"))
  );
  const provider = makeAdapter(scenarios({ uidValidity: "8", uidNext: "6" }));

  const results = await syncIonosMailboxesV1({
    mailboxes,
    adapter: provider.adapter,
    cursorStore: store,
    now: fixedNow,
    sleep: noSleep
  });

  assert.deepEqual(results.map((result) => result.status), [
    "UIDVALIDITY_RESET",
    "UIDVALIDITY_RESET",
    "UIDVALIDITY_RESET"
  ]);
  assert.deepEqual(results.map((result) => result.candidateCount), [0, 0, 0]);
  assert.equal(provider.fetches.length, 0);
  assert.deepEqual(
    mailboxes.map((mailbox) => store.values.get(mailbox.id)?.uidValidity),
    ["8", "8", "8"]
  );
  assert.deepEqual(
    mailboxes.map((mailbox) => store.values.get(mailbox.id)?.lastSeenUid),
    ["5", "5", "5"]
  );
});

test("atomic compare-and-set rejection cannot emit candidates or advance stale state", async () => {
  const store = new MemoryCursorStore(mailboxes.map((mailbox) => cursor(mailbox.id)));
  store.rejectMailboxId = "personal";
  const provider = makeAdapter({
    personal: {
      status: { uidValidity: "7", uidNext: "12" },
      messages: [{ uid: "11", messageId: "<new@example.test>", size: 1 }]
    },
    assistant: { status: { uidValidity: "7", uidNext: "11" } },
    marketing: { status: { uidValidity: "7", uidNext: "11" } }
  });

  const results = await syncIonosMailboxesV1({
    mailboxes,
    adapter: provider.adapter,
    cursorStore: store,
    now: fixedNow,
    sleep: noSleep
  });

  assert.equal(results[0]?.status, "FAILED");
  assert.equal(results[0]?.reason, "CONCURRENT_CURSOR_UPDATE");
  assert.equal(results[0]?.candidateCount, 0);
  assert.deepEqual(results[0]?.candidates, []);
  assert.equal(store.values.get("personal")?.lastSeenUid, "10");
});

test("one mailbox can retry and fail without blocking or misreporting the others", async () => {
  const store = new MemoryCursorStore(mailboxes.map((mailbox) => cursor(mailbox.id)));
  const provider = makeAdapter({
    personal: {
      status: { uidValidity: "7", uidNext: "11" },
      openFailures: 2
    },
    assistant: { status: { uidValidity: "7", uidNext: "11" } },
    marketing: { status: { uidValidity: "7", uidNext: "11" } }
  });
  const sleeps: number[] = [];

  const results = await syncIonosMailboxesV1({
    mailboxes,
    adapter: provider.adapter,
    cursorStore: store,
    options: { maxAttempts: 2, retryDelayMs: 5 },
    now: fixedNow,
    sleep: async (milliseconds) => {
      sleeps.push(milliseconds);
    }
  });

  assert.equal(results[0]?.status, "FAILED");
  assert.equal(results[0]?.reason, "PROVIDER_RETRY_EXHAUSTED");
  assert.equal(results[0]?.retryCount, 1);
  assert.deepEqual(results.slice(1).map((result) => result.status), ["NO_NEW_MAIL", "NO_NEW_MAIL"]);
  assert.deepEqual(sleeps, [5]);
});

test("a bounded reconnect succeeds once and records retry evidence", async () => {
  const store = new MemoryCursorStore(mailboxes.map((mailbox) => cursor(mailbox.id)));
  const provider = makeAdapter({
    personal: { status: { uidValidity: "7", uidNext: "11" }, openFailures: 1 },
    assistant: { status: { uidValidity: "7", uidNext: "11" } },
    marketing: { status: { uidValidity: "7", uidNext: "11" } }
  });

  const results = await syncIonosMailboxesV1({
    mailboxes,
    adapter: provider.adapter,
    cursorStore: store,
    options: { maxAttempts: 2, retryDelayMs: 0 },
    now: fixedNow,
    sleep: noSleep
  });

  assert.equal(results[0]?.status, "NO_NEW_MAIL");
  assert.equal(results[0]?.retryCount, 1);
  assert.equal(provider.opens.filter((id) => id === "personal").length, 2);
});

test("elapsed-time reserve stops retries at the exact boundary", async () => {
  const store = new MemoryCursorStore(mailboxes.map((mailbox) => cursor(mailbox.id)));
  const failing = makeAdapter({
    personal: { status: { uidValidity: "7", uidNext: "11" }, openFailures: 3 },
    assistant: { status: { uidValidity: "7", uidNext: "11" }, openFailures: 3 },
    marketing: { status: { uidValidity: "7", uidNext: "11" }, openFailures: 3 }
  });

  const results = await syncIonosMailboxesV1({
    mailboxes,
    adapter: failing.adapter,
    cursorStore: store,
    options: { maxAttempts: 3, retryDelayMs: 10, maxElapsedMs: 10 },
    now: fixedNow,
    sleep: noSleep
  });

  assert.deepEqual(results.map((result) => result.reason), [
    "RETRY_DEADLINE_EXHAUSTED",
    "RETRY_DEADLINE_EXHAUSTED",
    "RETRY_DEADLINE_EXHAUSTED"
  ]);
  assert.deepEqual(results.map((result) => result.retryCount), [0, 0, 0]);
});

test("rejects malformed caps, attempts, delay, elapsed budget, and clock values", async () => {
  const store = new MemoryCursorStore();
  const provider = makeAdapter(scenarios());

  for (const options of [
    { batchSize: 0 },
    { batchSize: Number.POSITIVE_INFINITY },
    { maxAttempts: 0 },
    { maxAttempts: 1.5 },
    { retryDelayMs: -1 },
    { retryDelayMs: Number.NaN },
    { maxElapsedMs: 0 }
  ]) {
    await assert.rejects(
      () =>
        syncIonosMailboxesV1({
          mailboxes,
          adapter: provider.adapter,
          cursorStore: store,
          options,
          now: fixedNow,
          sleep: noSleep
        }),
      /options\./
    );
  }

  await assert.rejects(
    () =>
      syncIonosMailboxesV1({
        mailboxes,
        adapter: provider.adapter,
        cursorStore: store,
        now: () => Number.NaN,
        sleep: noSleep
      }),
    /now must return/
  );
});

test("rejects malformed mailbox sets, duplicate identities, duplicate roles, and send-enabled input", async () => {
  const store = new MemoryCursorStore();
  const provider = makeAdapter(scenarios());

  const invalidSets: unknown[] = [
    mailboxes.slice(0, 2),
    [mailboxes[0], mailboxes[0], mailboxes[2]],
    [mailboxes[0], { ...mailboxes[1], role: mailboxes[0]?.role }, mailboxes[2]],
    [mailboxes[0], { ...mailboxes[1], smtpEnabled: true }, mailboxes[2]],
    [mailboxes[0], { ...mailboxes[1], password: "plaintext" }, mailboxes[2]]
  ];

  for (const invalid of invalidSets) {
    await assert.rejects(
      () =>
        syncIonosMailboxesV1({
          mailboxes: invalid as IonosMailboxRuntimeV1[],
          adapter: provider.adapter,
          cursorStore: store,
          now: fixedNow,
          sleep: noSleep
        })
    );
  }
});

test("fails closed on malformed cursors and incomplete, duplicate, or out-of-range provider data", async () => {
  const malformedCursorStore: EmailCursorStoreV1 = {
    async read(mailboxId) {
      return {
        mailboxId,
        uidValidity: "-1",
        lastSeenUid: "10",
        updatedAt: "not-a-date"
      };
    },
    async compareAndSet() {
      return true;
    }
  };
  const provider = makeAdapter(scenarios());

  const malformedCursorResults = await syncIonosMailboxesV1({
    mailboxes,
    adapter: provider.adapter,
    cursorStore: malformedCursorStore,
    options: { maxAttempts: 1 },
    now: fixedNow,
    sleep: noSleep
  });
  assert.deepEqual(malformedCursorResults.map((result) => result.status), [
    "FAILED",
    "FAILED",
    "FAILED"
  ]);

  for (const personal of [
    {
      status: { uidValidity: "7", uidNext: "12" },
      complete: false,
      messages: [{ uid: "11" }]
    },
    {
      status: { uidValidity: "7", uidNext: "12" },
      messages: [{ uid: "11" }, { uid: 11 }]
    },
    {
      status: { uidValidity: "7", uidNext: "12" },
      messages: [{ uid: "12" }]
    },
    {
      status: { uidValidity: "not-a-uid", uidNext: "12" }
    }
  ] satisfies AdapterScenario[]) {
    const store = new MemoryCursorStore(mailboxes.map((mailbox) => cursor(mailbox.id)));
    const malformedProvider = makeAdapter({
      personal,
      assistant: { status: { uidValidity: "7", uidNext: "11" } },
      marketing: { status: { uidValidity: "7", uidNext: "11" } }
    });
    const results = await syncIonosMailboxesV1({
      mailboxes,
      adapter: malformedProvider.adapter,
      cursorStore: store,
      options: { maxAttempts: 1 },
      now: fixedNow,
      sleep: noSleep
    });
    assert.equal(results[0]?.status, "FAILED");
    assert.equal(store.values.get("personal")?.lastSeenUid, "10");
  }
});

test("results and telemetry remain deterministic and secrets-safe with a read-only-only adapter surface", async () => {
  const firstStore = new MemoryCursorStore(mailboxes.map((mailbox) => cursor(mailbox.id)));
  const secondStore = new MemoryCursorStore(mailboxes.map((mailbox) => cursor(mailbox.id)));
  const firstProvider = makeAdapter(scenarios());
  const secondProvider = makeAdapter(scenarios());

  const first = await syncIonosMailboxesV1({
    mailboxes,
    adapter: firstProvider.adapter,
    cursorStore: firstStore,
    now: fixedNow,
    sleep: noSleep
  });
  const second = await syncIonosMailboxesV1({
    mailboxes,
    adapter: secondProvider.adapter,
    cursorStore: secondStore,
    now: fixedNow,
    sleep: noSleep
  });

  assert.deepEqual(first, second);
  const serialized = JSON.stringify(first);
  assert.doesNotMatch(
    serialized,
    /example\.test|fixture-a|fixture-b|fixture-c|op:\/\/|provider leaked/
  );
  assert.deepEqual(Object.keys(firstProvider.adapter), ["openReadOnly"]);
  assert.equal("send" in firstProvider.adapter, false);
  assert.equal("store" in firstProvider.adapter, false);
  assert.equal("fetchBody" in firstProvider.adapter, false);
});
