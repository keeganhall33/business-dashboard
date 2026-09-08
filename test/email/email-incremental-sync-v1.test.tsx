import assert from "node:assert/strict";
import test from "node:test";

import {
  syncEmailMailboxesIncrementallyV1,
  type EmailCursorStoreV1,
  type EmailProviderAdapterV1,
  type EmailProviderFetchResultV1,
  type EmailProviderStatusV1,
  type EmailSyncCursorV1,
  type EmailSyncTargetV1
} from "@/lib/email/email-incremental-sync-v1";

const NOW = "2026-09-08T13:30:00.000Z";
const now = () => new Date(NOW);

const personal: EmailSyncTargetV1 = {
  id: "personal",
  role: "PERSONAL_HIGH_VALUE_RELATIONSHIP",
  folder: "INBOX"
};
const assistant: EmailSyncTargetV1 = {
  id: "assistant",
  role: "ASSISTANT_CUSTOMER_SERVICE_OUTREACH",
  folder: "INBOX"
};
const marketing: EmailSyncTargetV1 = {
  id: "marketing",
  role: "MARKETING_FUNNELKIT",
  folder: "INBOX"
};

function cursor(mailboxId: string, uidValidity: string, newestUid: string): EmailSyncCursorV1 {
  return {
    mailboxId,
    folder: "INBOX",
    uidValidity,
    newestUid,
    updatedAt: "2026-09-08T12:00:00.000Z"
  };
}

function memoryCursorStore(initial: readonly EmailSyncCursorV1[] = []) {
  const values = new Map(initial.map((entry) => [`${entry.mailboxId}:${entry.folder}`, { ...entry }]));
  const saves: EmailSyncCursorV1[] = [];
  const store: EmailCursorStoreV1 = {
    async load(mailboxId, folder) {
      const value = values.get(`${mailboxId}:${folder}`);
      return value ? { ...value } : null;
    },
    async save(value) {
      saves.push({ ...value });
      values.set(`${value.mailboxId}:${value.folder}`, { ...value });
    }
  };
  return {
    store,
    saves,
    read(mailboxId: string, folder = "INBOX") {
      const value = values.get(`${mailboxId}:${folder}`);
      return value ? { ...value } : null;
    }
  };
}

function mockAdapter(input: {
  status?: EmailProviderStatusV1;
  fetchResult?: EmailProviderFetchResultV1;
  connectError?: Error;
  fetchError?: Error;
}) {
  const calls = {
    connect: 0,
    opens: [] as Array<{ folder: string; readOnly: true }>,
    status: [] as string[],
    fetches: [] as Array<{ folder: string; fromUid: string; toUid: string; limit: number }>,
    disconnect: 0
  };

  const adapter: EmailProviderAdapterV1 = {
    async connect() {
      calls.connect += 1;
      if (input.connectError) throw input.connectError;
    },
    async openMailbox(folder, options) {
      calls.opens.push({ folder, readOnly: options.readOnly });
    },
    async status(folder) {
      calls.status.push(folder);
      return input.status ?? { uidValidity: 7n, uidNext: 1n };
    },
    async fetchMetadataByUid(request) {
      calls.fetches.push({ ...request });
      if (input.fetchError) throw input.fetchError;
      return input.fetchResult ?? { messages: [], completeThroughUid: request.toUid };
    },
    async disconnect() {
      calls.disconnect += 1;
    }
  };

  return { adapter, calls };
}

test("establishes a cursor without backfilling existing mail and opens the mailbox read-only", async () => {
  const state = memoryCursorStore();
  const provider = mockAdapter({ status: { uidValidity: 41n, uidNext: 501n } });

  const result = await syncEmailMailboxesIncrementallyV1([personal], {
    adapterFactory: () => provider.adapter,
    cursorStore: state.store,
    now
  });

  assert.equal(result.failureCount, 0);
  assert.equal(result.mailboxes[0]?.status, "CURSOR_ESTABLISHED");
  assert.equal(result.mailboxes[0]?.candidates.length, 0);
  assert.equal(provider.calls.fetches.length, 0);
  assert.deepEqual(provider.calls.opens, [{ folder: "INBOX", readOnly: true }]);
  assert.equal(state.read("personal")?.uidValidity, "41");
  assert.equal(state.read("personal")?.newestUid, "500");
  assert.equal(state.read("personal")?.updatedAt, NOW);
});

test("fetches only the bounded UID delta, strips body-like fields, and advances through the confirmed range", async () => {
  const state = memoryCursorStore([cursor("personal", "41", "10")]);
  const provider = mockAdapter({
    status: { uidValidity: 41n, uidNext: 25n },
    fetchResult: {
      completeThroughUid: 13n,
      messages: [
        {
          uid: 13n,
          messageId: "<13@example.test>",
          internalDate: "2026-09-08T13:00:00Z",
          from: "Collector <collector@example.test>",
          to: "Keegan <keegan@example.test>",
          subject: " Commission inquiry   ",
          size: 900,
          body: "BODY MUST NEVER ESCAPE",
          source: "RAW SOURCE MUST NEVER ESCAPE"
        },
        {
          uid: 11,
          messageId: "<11@example.test>",
          internalDate: new Date("2026-09-08T12:55:00Z"),
          from: "Partner <partner@example.test>",
          to: "Keegan <keegan@example.test>",
          subject: "Partnership",
          size: 700
        }
      ]
    }
  });

  const result = await syncEmailMailboxesIncrementallyV1([personal], {
    adapterFactory: () => provider.adapter,
    cursorStore: state.store,
    maxMessagesPerMailbox: 3,
    now
  });

  const mailbox = result.mailboxes[0];
  assert.equal(mailbox?.status, "SYNCED");
  assert.deepEqual(provider.calls.fetches, [{ folder: "INBOX", fromUid: "11", toUid: "13", limit: 3 }]);
  assert.deepEqual(mailbox?.candidates.map((candidate) => candidate.uid), ["11", "13"]);
  assert.deepEqual(mailbox?.candidates.map((candidate) => candidate.candidateId), ["personal:41:11", "personal:41:13"]);
  assert.equal(mailbox?.candidates[1]?.subject, "Commission inquiry");
  assert.equal(state.read("personal")?.newestUid, "13");
  assert.doesNotMatch(JSON.stringify(mailbox), /BODY MUST NEVER ESCAPE|RAW SOURCE MUST NEVER ESCAPE/);
});

test("repeated sync with no new mail yields zero duplicate candidates", async () => {
  const state = memoryCursorStore([cursor("personal", "41", "10")]);
  let fetchCount = 0;

  const first = mockAdapter({
    status: { uidValidity: 41n, uidNext: 13n },
    fetchResult: {
      completeThroughUid: 12n,
      messages: [
        { uid: 11n, messageId: "<11@example.test>", internalDate: NOW, subject: "One", size: 10 },
        { uid: 12n, messageId: "<12@example.test>", internalDate: NOW, subject: "Two", size: 11 }
      ]
    }
  });
  const second = mockAdapter({ status: { uidValidity: 41n, uidNext: 13n } });

  const firstResult = await syncEmailMailboxesIncrementallyV1([personal], {
    adapterFactory: () => {
      fetchCount += 1;
      return first.adapter;
    },
    cursorStore: state.store,
    now
  });
  const secondResult = await syncEmailMailboxesIncrementallyV1([personal], {
    adapterFactory: () => second.adapter,
    cursorStore: state.store,
    now
  });

  assert.equal(firstResult.mailboxes[0]?.candidates.length, 2);
  assert.equal(secondResult.mailboxes[0]?.status, "NO_NEW_MAIL");
  assert.equal(secondResult.mailboxes[0]?.candidates.length, 0);
  assert.equal(second.calls.fetches.length, 0);
  assert.equal(fetchCount, 1);
});

test("UIDVALIDITY changes reset the cursor deterministically without replaying historical messages", async () => {
  const state = memoryCursorStore([cursor("personal", "41", "900")]);
  const provider = mockAdapter({ status: { uidValidity: 42n, uidNext: 51n } });

  const result = await syncEmailMailboxesIncrementallyV1([personal], {
    adapterFactory: () => provider.adapter,
    cursorStore: state.store,
    now
  });

  assert.equal(result.mailboxes[0]?.status, "UIDVALIDITY_RESET");
  assert.equal(result.mailboxes[0]?.candidates.length, 0);
  assert.equal(provider.calls.fetches.length, 0);
  assert.equal(state.read("personal")?.uidValidity, "42");
  assert.equal(state.read("personal")?.newestUid, "50");
});

test("polls three mailbox identities independently and contains provider failure detail", async () => {
  const state = memoryCursorStore();
  const providers = new Map([
    ["personal", mockAdapter({ status: { uidValidity: 1n, uidNext: 10n } })],
    ["assistant", mockAdapter({ connectError: new Error("login failed with leaked-mailbox-secret") })],
    ["marketing", mockAdapter({ status: { uidValidity: 3n, uidNext: 20n } })]
  ]);

  const result = await syncEmailMailboxesIncrementallyV1([personal, assistant, marketing], {
    adapterFactory: (target) => providers.get(target.id)!.adapter,
    cursorStore: state.store,
    maxAttempts: 1,
    now
  });

  assert.equal(result.mailboxCount, 3);
  assert.equal(result.successCount, 2);
  assert.equal(result.failureCount, 1);
  assert.deepEqual(result.mailboxes.map((mailbox) => mailbox.status), ["CURSOR_ESTABLISHED", "FAILED", "CURSOR_ESTABLISHED"]);
  assert.equal(result.mailboxes[1]?.telemetry.errorCode, "PROVIDER_FAILURE");
  assert.equal(result.mailboxes[1]?.telemetry.freshness, "UNKNOWN");
  assert.equal(state.read("personal")?.newestUid, "9");
  assert.equal(state.read("marketing")?.newestUid, "19");
  assert.doesNotMatch(JSON.stringify(result), /leaked-mailbox-secret|login failed/);
});

test("reconnects once after an evidenced provider failure using bounded backoff", async () => {
  const state = memoryCursorStore([cursor("personal", "41", "10")]);
  const first = mockAdapter({ connectError: new Error("temporary connection failure with secret-value") });
  const second = mockAdapter({
    status: { uidValidity: 41n, uidNext: 12n },
    fetchResult: {
      completeThroughUid: 11n,
      messages: [{ uid: 11n, messageId: "<11@example.test>", internalDate: NOW, subject: "New", size: 10 }]
    }
  });
  let factoryCalls = 0;
  const sleeps: number[] = [];

  const result = await syncEmailMailboxesIncrementallyV1([personal], {
    adapterFactory: () => (factoryCalls++ === 0 ? first.adapter : second.adapter),
    cursorStore: state.store,
    maxAttempts: 2,
    retryBackoffMs: 10,
    sleep: async (milliseconds) => {
      sleeps.push(milliseconds);
    },
    now
  });

  assert.equal(result.mailboxes[0]?.status, "SYNCED");
  assert.equal(result.mailboxes[0]?.telemetry.attempts, 2);
  assert.deepEqual(sleeps, [10]);
  assert.equal(first.calls.connect, 1);
  assert.equal(second.calls.connect, 1);
  assert.equal(state.read("personal")?.newestUid, "11");
  assert.doesNotMatch(JSON.stringify(result), /secret-value|temporary connection failure/);
});

test("fails closed on duplicate or incomplete provider UID evidence and never advances the cursor", async () => {
  const state = memoryCursorStore([cursor("personal", "41", "10")]);
  const duplicate = mockAdapter({
    status: { uidValidity: 41n, uidNext: 13n },
    fetchResult: {
      completeThroughUid: 12n,
      messages: [
        { uid: 11n, messageId: "<11a@example.test>" },
        { uid: 11n, messageId: "<11b@example.test>" }
      ]
    }
  });

  const duplicateResult = await syncEmailMailboxesIncrementallyV1([personal], {
    adapterFactory: () => duplicate.adapter,
    cursorStore: state.store,
    maxAttempts: 3,
    now
  });

  assert.equal(duplicateResult.mailboxes[0]?.status, "FAILED");
  assert.equal(duplicateResult.mailboxes[0]?.telemetry.errorCode, "INVALID_PROVIDER_RESPONSE");
  assert.equal(duplicateResult.mailboxes[0]?.telemetry.attempts, 1);
  assert.equal(state.read("personal")?.newestUid, "10");

  const incomplete = mockAdapter({
    status: { uidValidity: 41n, uidNext: 13n },
    fetchResult: { completeThroughUid: 11n, messages: [{ uid: 11n }] }
  });
  const incompleteResult = await syncEmailMailboxesIncrementallyV1([personal], {
    adapterFactory: () => incomplete.adapter,
    cursorStore: state.store,
    now
  });

  assert.equal(incompleteResult.mailboxes[0]?.status, "FAILED");
  assert.equal(incompleteResult.mailboxes[0]?.telemetry.errorCode, "INVALID_PROVIDER_RESPONSE");
  assert.equal(state.read("personal")?.newestUid, "10");
});

test("fails closed on duplicate mailbox targets before opening any provider connection", async () => {
  const state = memoryCursorStore();
  const provider = mockAdapter({});

  await assert.rejects(
    () =>
      syncEmailMailboxesIncrementallyV1([personal, { ...personal }], {
        adapterFactory: () => provider.adapter,
        cursorStore: state.store,
        now
      }),
    /INVALID_INPUT/
  );
  assert.equal(provider.calls.connect, 0);
});
