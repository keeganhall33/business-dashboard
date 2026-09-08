import assert from "node:assert/strict";
import test from "node:test";

import * as adapterModule from "@/lib/email/ionos-imap-read-adapter-v1";
import { createIonosImapReadAdapterV1 } from "@/lib/email/ionos-imap-read-adapter-v1";
import type { IonosMailboxRuntimeV1 } from "@/lib/email/ionos-mailbox-config-v1";

const mailbox: IonosMailboxRuntimeV1 = {
  id: "personal",
  role: "PERSONAL_HIGH_VALUE_RELATIONSHIP",
  user: "private@example.test",
  pass: "super-secret-password",
  host: "imap.ionos.com",
  port: 993,
  folder: "INBOX",
  minVersion: "TLSv1.2",
  smtpEnabled: false
};

class FakeImapClient {
  static instances: FakeImapClient[] = [];
  readonly options: unknown;
  readonly calls: Array<{ name: string; args?: unknown }> = [];
  messages: Array<{ uid: string | number | bigint; envelope?: { messageId?: string }; internalDate?: Date; size?: number }> = [];
  statusValue: { uidValidity: string | number | bigint; uidNext: string | number | bigint } = { uidValidity: "7", uidNext: "10" };
  connectError: Error | null = null;
  openError: Error | null = null;
  logoutError: Error | null = null;

  constructor(options: unknown) {
    this.options = options;
    FakeImapClient.instances.push(this);
  }

  async connect() {
    this.calls.push({ name: "connect" });
    if (this.connectError) throw this.connectError;
  }

  async mailboxOpen(folder: string, options: { readOnly: true }) {
    this.calls.push({ name: "mailboxOpen", args: { folder, options } });
    if (this.openError) throw this.openError;
  }

  async status(folder: string, query: unknown) {
    this.calls.push({ name: "status", args: { folder, query } });
    return this.statusValue;
  }

  async *fetch(range: string, query: unknown, options: unknown) {
    this.calls.push({ name: "fetch", args: { range, query, options } });
    for (const message of this.messages) yield message;
  }

  async logout() {
    this.calls.push({ name: "logout" });
    if (this.logoutError) throw this.logoutError;
  }
}

function adapter(now = () => 1_000) {
  FakeImapClient.instances = [];
  return createIonosImapReadAdapterV1({ ImapFlowCtor: FakeImapClient, now });
}

test("opens the configured mailbox read-only and exposes no mutation capability", async () => {
  const readAdapter = adapter();
  const session = await readAdapter.openReadOnly(mailbox, { deadlineAtMs: 10_000 });
  const client = FakeImapClient.instances[0];
  assert.ok(client);
  assert.deepEqual(client.calls.slice(0, 2), [
    { name: "connect" },
    { name: "mailboxOpen", args: { folder: "INBOX", options: { readOnly: true } } }
  ]);
  assert.deepEqual(Object.keys(session).sort(), ["close", "fetchMetadata", "status"]);
  assert.doesNotMatch(JSON.stringify(Object.keys(session)), /store|flag|copy|move|delete|expunge|append|smtp|send/i);
  await session.close();
  await session.close();
  assert.equal(client.calls.filter((call) => call.name === "logout").length, 1);
});

test("preserves large UIDs and honors the exact requested range and limit", async () => {
  const readAdapter = adapter();
  const session = await readAdapter.openReadOnly(mailbox, { deadlineAtMs: 10_000 });
  const client = FakeImapClient.instances[0];
  assert.ok(client);
  client.statusValue = { uidValidity: 90071992547409931n, uidNext: 90071992547409939n };
  client.messages = [
    { uid: 90071992547409932n, envelope: { messageId: " <one@example.test> " }, internalDate: new Date("2026-09-08T20:00:00Z"), size: 10 },
    { uid: 90071992547409933n, envelope: { messageId: "<two@example.test>" }, internalDate: new Date("2026-09-08T20:01:00Z"), size: 20 },
    { uid: 90071992547409934n, envelope: { messageId: "<three@example.test>" }, size: 30 }
  ];
  assert.deepEqual(await session.status(), {
    uidValidity: "90071992547409931",
    uidNext: "90071992547409939"
  });
  const result = await session.fetchMetadata({
    fromUid: "90071992547409932",
    toUid: "90071992547409934",
    limit: 2
  });
  assert.equal(result.complete, true);
  assert.deepEqual(result.messages.map((item) => item.uid), ["90071992547409932", "90071992547409933"]);
  const fetchCall = client.calls.find((call) => call.name === "fetch");
  assert.deepEqual(fetchCall?.args, {
    range: "90071992547409932:90071992547409934",
    query: { uid: true, envelope: true, internalDate: true, size: true },
    options: { uid: true }
  });
  await session.close();
});

test("deadline exhaustion is deterministic before connection and during a session", async () => {
  const readAdapter = adapter(() => 5_000);
  await assert.rejects(
    readAdapter.openReadOnly(mailbox, { deadlineAtMs: 5_000 }),
    /IONOS_IMAP_DEADLINE_EXHAUSTED/
  );
  let currentTime = 1_000;
  const activeAdapter = adapter(() => currentTime);
  const session = await activeAdapter.openReadOnly(mailbox, { deadlineAtMs: 2_000 });
  currentTime = 2_000;
  await assert.rejects(session.status(), /IONOS_IMAP_DEADLINE_EXHAUSTED/);
  await assert.rejects(session.close(), /IONOS_IMAP_DEADLINE_EXHAUSTED/);
  const client = FakeImapClient.instances[0];
  assert.ok(client);
  assert.equal(client.calls.filter((call) => call.name === "logout").length, 1);
});

test("open failures redact credentials and clean up an established connection", async () => {
  class OpenFailureClient extends FakeImapClient {
    override async mailboxOpen(folder: string, options: { readOnly: true }) {
      await super.mailboxOpen(folder, options);
      throw new Error(`failed for ${mailbox.user} ${mailbox.pass} op://vault/private/password`);
    }
  }
  const readAdapter = createIonosImapReadAdapterV1({ ImapFlowCtor: OpenFailureClient, now: () => 1_000 });
  await assert.rejects(
    readAdapter.openReadOnly(mailbox, { deadlineAtMs: 10_000 }),
    (error: Error) => {
      assert.doesNotMatch(error.message, /private@example\.test|super-secret-password|op:\/\//);
      assert.match(error.message, /REDACTED/);
      return true;
    }
  );
  const client = FakeImapClient.instances.at(-1);
  assert.ok(client);
  assert.equal(client.calls.filter((call) => call.name === "logout").length, 1);
});

test("runtime module exports only the read-only adapter factory", () => {
  assert.deepEqual(Object.keys(adapterModule), ["createIonosImapReadAdapterV1"]);
});
