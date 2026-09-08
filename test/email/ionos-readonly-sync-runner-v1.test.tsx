import assert from "node:assert/strict";
import test from "node:test";

import * as runnerModule from "@/lib/email/ionos-readonly-sync-runner-v1";
import { runIonosReadonlySyncV1 } from "@/lib/email/ionos-readonly-sync-runner-v1";
import type {
  EmailCursorStoreV1,
  EmailProviderAdapterV1,
  EmailSyncCursorV1
} from "@/lib/email/ionos-incremental-sync-v1";

const CONFIG = [
  {
    id: "personal",
    role: "PERSONAL_HIGH_VALUE_RELATIONSHIP",
    emailRef: "op://IONOS/personal/email",
    passwordRef: "op://IONOS/personal/password"
  },
  {
    id: "assistant",
    role: "ASSISTANT_CUSTOMER_SERVICE_OUTREACH",
    emailRef: "op://IONOS/assistant/email",
    passwordRef: "op://IONOS/assistant/password"
  },
  {
    id: "marketing",
    role: "MARKETING_FUNNELKIT",
    emailRef: "op://IONOS/marketing/email",
    passwordRef: "op://IONOS/marketing/password"
  }
] as const;

const SECRET_VALUES: Record<string, string> = {
  "op://IONOS/personal/email": "personal@example.test",
  "op://IONOS/personal/password": "personal-secret",
  "op://IONOS/assistant/email": "assistant@example.test",
  "op://IONOS/assistant/password": "assistant-secret",
  "op://IONOS/marketing/email": "marketing@example.test",
  "op://IONOS/marketing/password": "marketing-secret"
};

class MemoryCursorStore implements EmailCursorStoreV1 {
  readonly cursors = new Map<string, EmailSyncCursorV1>();

  async read(mailboxId: string) {
    return this.cursors.get(mailboxId) ?? null;
  }

  async compareAndSet(
    mailboxId: string,
    expected: EmailSyncCursorV1 | null,
    next: EmailSyncCursorV1
  ) {
    const current = this.cursors.get(mailboxId) ?? null;
    if (JSON.stringify(current) !== JSON.stringify(expected)) return false;
    this.cursors.set(mailboxId, structuredClone(next));
    return true;
  }
}

function resolver(reference: string): string {
  const value = SECRET_VALUES[reference];
  if (!value) throw new Error("missing test secret");
  return value;
}

function adapter(options: { failMailboxId?: string } = {}) {
  const opened: Array<{
    id: string;
    role: string;
    smtpEnabled: boolean;
    deadlineAtMs: number;
  }> = [];
  const provider: EmailProviderAdapterV1 = {
    async openReadOnly(mailbox, context) {
      opened.push({
        id: mailbox.id,
        role: mailbox.role,
        smtpEnabled: mailbox.smtpEnabled,
        deadlineAtMs: context.deadlineAtMs
      });
      if (mailbox.id === options.failMailboxId) {
        throw new Error(`provider failure for ${mailbox.user} ${mailbox.pass}`);
      }
      return {
        async status() {
          return { uidValidity: "7", uidNext: "11" };
        },
        async fetchMetadata() {
          throw new Error("initial baseline must not fetch");
        },
        async close() {}
      };
    }
  };
  return { provider, opened };
}

const NOW = () => Date.parse("2026-09-08T22:00:00.000Z");
const NO_SLEEP = async () => {};

function dependencies(options: { failMailboxId?: string } = {}) {
  const made = adapter(options);
  const store = new MemoryCursorStore();
  const paths: string[] = [];
  return {
    made,
    store,
    paths,
    value: {
      createAdapter(input: { now?: () => number }) {
        assert.equal(input.now, NOW);
        return made.provider;
      },
      createCursorStore(filePath: string) {
        paths.push(filePath);
        return store;
      }
    }
  };
}

test("resolves and synchronizes exactly the three governed mailbox roles once", async () => {
  const injected = dependencies();
  const result = await runIonosReadonlySyncV1({
    mailboxConfig: CONFIG,
    resolveSecretRef: resolver,
    cursorStatePath: "/tmp/ionos-cursors.json",
    now: NOW,
    sleep: NO_SLEEP,
    dependencies: injected.value
  });

  assert.deepEqual(
    injected.made.opened.map((mailbox) => mailbox.id),
    ["personal", "assistant", "marketing"]
  );
  assert.deepEqual(
    injected.made.opened.map((mailbox) => mailbox.role),
    [
      "PERSONAL_HIGH_VALUE_RELATIONSHIP",
      "ASSISTANT_CUSTOMER_SERVICE_OUTREACH",
      "MARKETING_FUNNELKIT"
    ]
  );
  assert.ok(injected.made.opened.every((mailbox) => mailbox.smtpEnabled === false));
  assert.ok(injected.made.opened.every((mailbox) => Number.isSafeInteger(mailbox.deadlineAtMs)));
  assert.deepEqual(injected.paths, ["/tmp/ionos-cursors.json"]);
  assert.equal(result.results.length, 3);
  assert.ok(result.results.every((mailbox) => mailbox.status === "BASELINED"));
  assert.equal(injected.store.cursors.size, 3);
});

test("reports a failed mailbox distinctly without discarding successful siblings", async () => {
  const injected = dependencies({ failMailboxId: "assistant" });
  const result = await runIonosReadonlySyncV1({
    mailboxConfig: CONFIG,
    resolveSecretRef: resolver,
    cursorStatePath: "/tmp/ionos-cursors.json",
    options: { maxAttempts: 1, maxElapsedMs: 1_000 },
    now: NOW,
    sleep: NO_SLEEP,
    dependencies: injected.value
  });

  assert.deepEqual(
    result.results.map(({ mailboxId, status, reason }) => ({ mailboxId, status, reason })),
    [
      {
        mailboxId: "personal",
        status: "BASELINED",
        reason: "INITIAL_CURSOR_ESTABLISHED"
      },
      {
        mailboxId: "assistant",
        status: "FAILED",
        reason: "PROVIDER_RETRY_EXHAUSTED"
      },
      {
        mailboxId: "marketing",
        status: "BASELINED",
        reason: "INITIAL_CURSOR_ESTABLISHED"
      }
    ]
  );
  assert.equal(result.summary.successfulMailboxCount, 2);
  assert.equal(result.summary.failedMailboxCount, 1);
});

test("aggregate summary is deterministic and excludes credentials correspondence and provider errors", async () => {
  const run = async () => {
    const injected = dependencies({ failMailboxId: "assistant" });
    return runIonosReadonlySyncV1({
      mailboxConfig: CONFIG,
      resolveSecretRef: resolver,
      cursorStatePath: "/tmp/ionos-cursors.json",
      options: { maxAttempts: 1, maxElapsedMs: 1_000 },
      now: NOW,
      sleep: NO_SLEEP,
      dependencies: injected.value
    });
  };

  const first = await run();
  const second = await run();
  assert.deepEqual(second.summary, first.summary);
  assert.equal(first.summary.mailboxCount, 3);
  const serialized = JSON.stringify(first.summary);
  assert.doesNotMatch(
    serialized,
    /personal-secret|assistant-secret|marketing-secret|@example\.test|op:\/\/|message.?id|subject|body|participant|provider failure/i
  );
});

test("relative cursor paths unsupported input keys and malformed dependencies fail closed", async () => {
  await assert.rejects(
    runIonosReadonlySyncV1({
      mailboxConfig: CONFIG,
      resolveSecretRef: resolver,
      cursorStatePath: "relative/cursors.json"
    }),
    /CURSOR_PATH_MUST_BE_ABSOLUTE/
  );

  await assert.rejects(
    runIonosReadonlySyncV1({
      mailboxConfig: CONFIG,
      resolveSecretRef: resolver,
      cursorStatePath: "/tmp/cursors.json",
      surprise: true
    } as never),
    /UNSUPPORTED_KEYS/
  );

  await assert.rejects(
    runIonosReadonlySyncV1({
      mailboxConfig: CONFIG,
      resolveSecretRef: resolver,
      cursorStatePath: "/tmp/cursors.json",
      dependencies: { createAdapter: "invalid" }
    } as never),
    /ADAPTER_FACTORY_INVALID/
  );

  await assert.rejects(
    runIonosReadonlySyncV1({
      mailboxConfig: CONFIG,
      resolveSecretRef: resolver,
      cursorStatePath: "/tmp/cursors.json",
      dependencies: { extra: () => undefined }
    } as never),
    /DEPENDENCIES_UNSUPPORTED_KEYS/
  );
});

test("invalid configuration and invalid factory results fail closed", async () => {
  await assert.rejects(
    runIonosReadonlySyncV1({
      mailboxConfig: CONFIG.slice(0, 2),
      resolveSecretRef: resolver,
      cursorStatePath: "/tmp/cursors.json"
    }),
    /exactly 3 mailboxes/
  );

  await assert.rejects(
    runIonosReadonlySyncV1({
      mailboxConfig: CONFIG,
      resolveSecretRef: resolver,
      cursorStatePath: "/tmp/cursors.json",
      dependencies: {
        createAdapter: () => ({}) as EmailProviderAdapterV1,
        createCursorStore: () => new MemoryCursorStore()
      }
    }),
    /ADAPTER_INVALID/
  );

  await assert.rejects(
    runIonosReadonlySyncV1({
      mailboxConfig: CONFIG,
      resolveSecretRef: resolver,
      cursorStatePath: "/tmp/cursors.json",
      dependencies: {
        createAdapter: () => adapter().provider,
        createCursorStore: () => ({}) as EmailCursorStoreV1
      }
    }),
    /CURSOR_STORE_INVALID/
  );
});

test("errors cannot expose resolved secrets or 1Password references", async () => {
  await assert.rejects(
    runIonosReadonlySyncV1({
      mailboxConfig: CONFIG,
      resolveSecretRef: resolver,
      cursorStatePath: "/tmp/cursors.json",
      dependencies: {
        createAdapter: () => {
          throw new Error("personal-secret op://IONOS/personal/password");
        }
      }
    }),
    (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      assert.doesNotMatch(message, /personal-secret|op:\/\//);
      assert.match(message, /REDACTED/);
      return true;
    }
  );
});

test("runtime export exposes only explicit read-only sync composition", () => {
  assert.deepEqual(Object.keys(runnerModule), ["runIonosReadonlySyncV1"]);
  assert.doesNotMatch(
    JSON.stringify(Object.keys(runnerModule)),
    /send|smtp|store|copy|move|delete|expunge|append|schedule|automatic/i
  );
});
