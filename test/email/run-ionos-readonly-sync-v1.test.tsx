import assert from "node:assert/strict";
import test from "node:test";

import * as commandModule from "../../scripts/run-ionos-readonly-sync-v1";
import {
  runIonosReadonlySyncCommandV1,
  type IonosReadonlySyncCommandInputV1
} from "../../scripts/run-ionos-readonly-sync-v1";
import type {
  IonosReadonlySyncRunResultV1,
  IonosReadonlySyncRunnerInputV1,
  IonosReadonlySyncSummaryV1
} from "@/lib/email/ionos-readonly-sync-runner-v1";

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

const VALUES: Record<string, string> = {
  "op://IONOS/personal/email": "personal@example.test",
  "op://IONOS/personal/password": "personal-secret",
  "op://IONOS/assistant/email": "assistant@example.test",
  "op://IONOS/assistant/password": "assistant-secret",
  "op://IONOS/marketing/email": "marketing@example.test",
  "op://IONOS/marketing/password": "marketing-secret"
};

const NOW_MS = Date.parse("2026-09-09T00:00:00.000Z");
const NOW = () => NOW_MS;

function env(overrides: Record<string, string | undefined> = {}) {
  return {
    IONOS_MAILBOX_CONFIG_JSON: JSON.stringify(CONFIG),
    IONOS_CURSOR_STATE_PATH: "/tmp/ionos-cursors.json",
    IONOS_SYNC_TIMEOUT_MS: "60000",
    ...overrides
  };
}

function summary(failedMailboxCount = 0): IonosReadonlySyncSummaryV1 {
  return {
    mailboxCount: 3,
    successfulMailboxCount: 3 - failedMailboxCount,
    failedMailboxCount,
    totalFetchedCount: 0,
    totalCandidateCount: 0,
    mailboxes: [
      {
        mailboxId: "personal",
        role: "PERSONAL_HIGH_VALUE_RELATIONSHIP",
        status: "BASELINED",
        reason: "INITIAL_CURSOR_ESTABLISHED",
        fetchedCount: 0,
        candidateCount: 0,
        retryCount: 0,
        cursorFingerprint: "personal:7:10"
      },
      {
        mailboxId: "assistant",
        role: "ASSISTANT_CUSTOMER_SERVICE_OUTREACH",
        status: failedMailboxCount ? "FAILED" : "BASELINED",
        reason: failedMailboxCount ? "PROVIDER_RETRY_EXHAUSTED" : "INITIAL_CURSOR_ESTABLISHED",
        fetchedCount: 0,
        candidateCount: 0,
        retryCount: 0,
        cursorFingerprint: failedMailboxCount ? null : "assistant:7:10"
      },
      {
        mailboxId: "marketing",
        role: "MARKETING_FUNNELKIT",
        status: "BASELINED",
        reason: "INITIAL_CURSOR_ESTABLISHED",
        fetchedCount: 0,
        candidateCount: 0,
        retryCount: 0,
        cursorFingerprint: "marketing:7:10"
      }
    ]
  };
}

function fakeSync(
  observed: {
    calls: number;
    input?: IonosReadonlySyncRunnerInputV1;
    references: string[];
  },
  failedMailboxCount = 0
) {
  return async (
    input: IonosReadonlySyncRunnerInputV1
  ): Promise<IonosReadonlySyncRunResultV1> => {
    observed.calls += 1;
    observed.input = input;
    const parsed = input.mailboxConfig as typeof CONFIG;
    for (const mailbox of parsed) {
      observed.references.push(mailbox.emailRef, mailbox.passwordRef);
      await input.resolveSecretRef(mailbox.emailRef);
      await input.resolveSecretRef(mailbox.passwordRef);
    }
    return { results: [], summary: summary(failedMailboxCount) };
  };
}

test("uses six direct bounded op reads and invokes the merged sync composition once", async () => {
  const observed = { calls: 0, references: [] as string[], input: undefined as IonosReadonlySyncRunnerInputV1 | undefined };
  const commands: Array<{
    file: string;
    args: readonly string[];
    options: Record<string, unknown>;
  }> = [];
  const stdout: string[] = [];

  const result = await runIonosReadonlySyncCommandV1({
    env: env(),
    now: NOW,
    runCommand: async (file, args, options) => {
      commands.push({ file, args, options });
      return { stdout: VALUES[args[2]] };
    },
    runSync: fakeSync(observed),
    writeStdout: (text) => stdout.push(text)
  });

  assert.equal(observed.calls, 1);
  assert.deepEqual(observed.references, CONFIG.flatMap((mailbox) => [
    mailbox.emailRef,
    mailbox.passwordRef
  ]));
  assert.equal(observed.input?.cursorStatePath, "/tmp/ionos-cursors.json");
  assert.equal(observed.input?.options?.maxElapsedMs, 60_000);
  assert.equal(commands.length, 6);
  for (const [index, command] of commands.entries()) {
    assert.equal(command.file, "op");
    assert.deepEqual(command.args, ["read", "--no-newline", observed.references[index]]);
    assert.equal(command.options.shell, false);
    assert.equal(command.options.timeout, 60_000);
    assert.equal(command.options.maxBuffer, 64 * 1024);
    assert.equal(command.options.encoding, "utf8");
  }
  assert.deepEqual(result, summary());
  assert.equal(stdout.length, 1);
  assert.deepEqual(JSON.parse(stdout[0]), summary());
});

test("stdout contains only privacy-safe deterministic summary JSON", async () => {
  const observed = { calls: 0, references: [] as string[] };
  const stdout: string[] = [];
  await runIonosReadonlySyncCommandV1({
    env: env(),
    now: NOW,
    runCommand: async (_file, args) => ({ stdout: VALUES[args[2]] }),
    runSync: fakeSync(observed),
    writeStdout: (text) => stdout.push(text)
  });

  const serialized = stdout.join("");
  assert.doesNotMatch(
    serialized,
    /@example\.test|secret|op:\/\/|message.?id|subject|body|participant|provider|stderr|stdout/i
  );
  assert.equal(serialized.endsWith("\n"), true);
});

test("plaintext configuration malformed JSON and missing variables fail before subprocess execution", async () => {
  let commandCalls = 0;
  const runCommand = async () => {
    commandCalls += 1;
    return { stdout: "should-not-run" };
  };

  await assert.rejects(
    runIonosReadonlySyncCommandV1({
      env: env({
        IONOS_MAILBOX_CONFIG_JSON: JSON.stringify([
          { id: "bad", role: "PERSONAL_HIGH_VALUE_RELATIONSHIP", email: "plain@example.test", password: "plain" }
        ])
      }),
      runCommand
    }),
    /mailbox config|mailboxes\[0\]/i
  );
  await assert.rejects(
    runIonosReadonlySyncCommandV1({
      env: env({ IONOS_MAILBOX_CONFIG_JSON: "{" }),
      runCommand
    }),
    /MAILBOX_CONFIG_JSON_INVALID/
  );
  await assert.rejects(
    runIonosReadonlySyncCommandV1({
      env: env({ IONOS_CURSOR_STATE_PATH: undefined }),
      runCommand
    }),
    /MISSING_ENV_IONOS_CURSOR_STATE_PATH/
  );
  assert.equal(commandCalls, 0);
});

test("relative paths invalid timeouts and unknown command inputs fail closed", async () => {
  await assert.rejects(
    runIonosReadonlySyncCommandV1({
      env: env({ IONOS_CURSOR_STATE_PATH: "relative.json" })
    }),
    /CURSOR_PATH_MUST_BE_ABSOLUTE/
  );
  for (const timeout of ["0", "999", "600001", "1.5", "no"]) {
    await assert.rejects(
      runIonosReadonlySyncCommandV1({
        env: env({ IONOS_SYNC_TIMEOUT_MS: timeout })
      }),
      /TIMEOUT_INVALID/
    );
  }
  await assert.rejects(
    runIonosReadonlySyncCommandV1({
      env: env(),
      surprise: true
    } as IonosReadonlySyncCommandInputV1),
    /UNSUPPORTED_KEYS/
  );
});

test("subprocess timeout and failures produce deterministic redacted errors", async () => {
  const cases = [
    {
      error: Object.assign(
        new Error("personal@example.test personal-secret op://IONOS/personal/password raw child stderr"),
        { code: "ETIMEDOUT", killed: true }
      ),
      expected: /IONOS_SECRET_RESOLUTION_TIMEOUT/
    },
    {
      error: new Error("personal@example.test personal-secret op://IONOS/personal/password raw child stderr"),
      expected: /IONOS_SECRET_RESOLUTION_FAILED/
    }
  ];

  for (const scenario of cases) {
    const observed = { calls: 0, references: [] as string[] };
    await assert.rejects(
      runIonosReadonlySyncCommandV1({
        env: env(),
        now: NOW,
        runCommand: async () => {
          throw scenario.error;
        },
        runSync: fakeSync(observed),
        writeStdout: () => {}
      }),
      (error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        assert.match(message, scenario.expected);
        assert.doesNotMatch(
          message,
          /personal@example\.test|personal-secret|op:\/\/|raw child stderr/i
        );
        return true;
      }
    );
  }
});

test("mailbox failure prints its safe summary and then returns failure", async () => {
  const observed = { calls: 0, references: [] as string[] };
  const stdout: string[] = [];
  await assert.rejects(
    runIonosReadonlySyncCommandV1({
      env: env(),
      now: NOW,
      runCommand: async (_file, args) => ({ stdout: VALUES[args[2]] }),
      runSync: fakeSync(observed, 1),
      writeStdout: (text) => stdout.push(text)
    }),
    /IONOS_SYNC_MAILBOX_FAILURE/
  );
  assert.equal(JSON.parse(stdout[0]).failedMailboxCount, 1);
  assert.doesNotMatch(stdout[0], /secret|@example\.test|op:\/\//i);
});

test("total deadline exhaustion is deterministic", async () => {
  const times = [NOW_MS, NOW_MS + 1_000];
  const now = () => times.shift() ?? NOW_MS + 60_000;
  await assert.rejects(
    runIonosReadonlySyncCommandV1({
      env: env({ IONOS_SYNC_TIMEOUT_MS: "1000" }),
      now,
      runCommand: async () => ({ stdout: "unused" }),
      runSync: async () => {
        throw new Error("runSync must not execute");
      },
      writeStdout: () => {}
    }),
    /IONOS_SYNC_TOTAL_DEADLINE_EXHAUSTED/
  );
});

test("module is import-safe and exposes no send mutation or scheduler API", () => {
  assert.deepEqual(
    Object.keys(commandModule).sort(),
    ["mainIonosReadonlySyncV1", "runIonosReadonlySyncCommandV1"]
  );
  assert.doesNotMatch(
    JSON.stringify(Object.keys(commandModule)),
    /send|smtp|store|copy|move|delete|expunge|append|schedule|automatic/i
  );
});
