import assert from "node:assert/strict";
import test from "node:test";

import {
  loadMailboxConfigs,
  runConfiguredProof,
  runMailboxProof,
  safeJsonStringify
} from "../scripts/ionos-imap-connection-proof.mjs";

function directConfig(overrides = {}) {
  return {
    id: "primary",
    user: "owner@example.test",
    pass: "secret-pass",
    host: "imap.ionos.com",
    port: 993,
    folder: "INBOX",
    minVersion: "TLSv1.2",
    ...overrides
  };
}

class FakeImapFlow {
  static instances = [];

  constructor(options) {
    this.options = options;
    this.calls = [];
    this.statusCalls = 0;
    this.fetchArgs = null;
    FakeImapFlow.instances.push(this);
  }

  async connect() {
    this.calls.push("connect");
  }

  async list() {
    this.calls.push("list");
    return [
      { path: "INBOX", delimiter: "/", flags: new Set(["\\HasNoChildren"]) },
      { path: "Sent", delimiter: "/", flags: new Set(["\\Sent"]) }
    ];
  }

  async status(folder, query) {
    this.calls.push(["status", folder, query]);
    this.statusCalls += 1;
    return {
      messages: 12,
      unseen: 4,
      uidNext: 13n,
      uidValidity: 9007199254740993n
    };
  }

  async mailboxOpen(folder, options) {
    this.calls.push(["mailboxOpen", folder, options]);
  }

  fetch(range, query, options) {
    this.calls.push(["fetch", range, query, options]);
    this.fetchArgs = { range, query, options };

    return (async function* () {
      for (let uid = 1n; uid <= 12n; uid += 1n) {
        yield {
          uid,
          envelope: {
            messageId: `<${uid}@example.test>`,
            from: [{ name: "Sender", address: "sender@example.test" }],
            to: [{ name: "Recipient", address: "recipient@example.test" }],
            subject: `Message ${uid}`
          },
          internalDate: new Date(`2026-09-08T00:${String(Number(uid)).padStart(2, "0")}:00.000Z`),
          size: 1000n + uid
        };
      }
    })();
  }

  async logout() {
    this.calls.push("logout");
  }
}

test("single-mailbox configuration preserves the existing env contract", () => {
  const config = loadMailboxConfigs({
    IONOS_EMAIL_ADDRESS: "owner@example.test",
    IONOS_EMAIL_APP_PASSWORD: "secret-pass",
    IONOS_MAILBOX_ID: "keegan",
    IONOS_IMAP_FOLDER: "INBOX"
  });

  assert.equal(config.mode, "single");
  assert.equal(config.mailboxes.length, 1);
  assert.deepEqual(config.mailboxes[0], {
    id: "keegan",
    user: "owner@example.test",
    pass: "secret-pass",
    host: "imap.ionos.com",
    port: 993,
    folder: "INBOX",
    minVersion: "TLSv1.2"
  });
});

test("multi-mailbox configuration resolves credential references without accepting plaintext credential keys", () => {
  const env = {
    IONOS_MAILBOXES_JSON: JSON.stringify([
      { id: "primary", emailEnv: "MAIL_A_USER", passwordEnv: "MAIL_A_PASS" },
      {
        id: "assistant",
        emailEnv: "MAIL_B_USER",
        passwordEnv: "MAIL_B_PASS",
        folder: "Archive",
        port: 993
      }
    ]),
    MAIL_A_USER: "a@example.test",
    MAIL_A_PASS: "a-secret",
    MAIL_B_USER: "b@example.test",
    MAIL_B_PASS: "b-secret"
  };

  const config = loadMailboxConfigs(env);
  assert.equal(config.mode, "multi");
  assert.equal(config.mailboxes.length, 2);
  assert.equal(config.mailboxes[0].user, "a@example.test");
  assert.equal(config.mailboxes[1].folder, "Archive");

  assert.throws(
    () =>
      loadMailboxConfigs({
        IONOS_MAILBOXES_JSON: JSON.stringify([
          {
            id: "unsafe",
            emailEnv: "MAIL_USER",
            passwordEnv: "MAIL_PASS",
            password: "plaintext"
          }
        ]),
        MAIL_USER: "user@example.test",
        MAIL_PASS: "secret"
      }),
    /unsupported keys: password/
  );
});

test("configuration rejects duplicate identities, missing references, and invalid ports", () => {
  assert.throws(
    () =>
      loadMailboxConfigs({
        IONOS_MAILBOXES_JSON: JSON.stringify([
          { id: "same", emailEnv: "A_USER", passwordEnv: "A_PASS" },
          { id: "same", emailEnv: "B_USER", passwordEnv: "B_PASS" }
        ]),
        A_USER: "a@example.test",
        A_PASS: "a",
        B_USER: "b@example.test",
        B_PASS: "b"
      }),
    /Duplicate mailbox id same/
  );

  assert.throws(
    () =>
      loadMailboxConfigs({
        IONOS_MAILBOXES_JSON: JSON.stringify([
          { id: "missing", emailEnv: "MISSING_USER", passwordEnv: "MISSING_PASS" }
        ])
      }),
    /Missing required env MISSING_USER/
  );

  assert.throws(
    () =>
      loadMailboxConfigs({
        IONOS_EMAIL_ADDRESS: "owner@example.test",
        IONOS_EMAIL_APP_PASSWORD: "secret",
        IONOS_IMAP_PORT: "70000"
      }),
    /must be an integer between 1 and 65535/
  );
});

test("proof awaits list array, opens read-only, fetches by UID without body content, caps at ten, and serializes BigInt safely", async () => {
  FakeImapFlow.instances = [];

  const result = await runMailboxProof(directConfig(), { ImapFlowCtor: FakeImapFlow });
  const client = FakeImapFlow.instances[0];

  assert.equal(client.statusCalls, 2);
  assert.deepEqual(
    client.calls.find((call) => Array.isArray(call) && call[0] === "mailboxOpen"),
    ["mailboxOpen", "INBOX", { readOnly: true }]
  );

  assert.equal(client.fetchArgs.range, "1:12");
  assert.equal(client.fetchArgs.options.uid, true);
  assert.deepEqual(client.fetchArgs.query, {
    uid: true,
    envelope: true,
    internalDate: true,
    size: true
  });
  assert.equal("bodyParts" in client.fetchArgs.query, false);
  assert.equal("source" in client.fetchArgs.query, false);

  assert.equal(result.messages.length, 10);
  assert.equal(result.messages[0].uid, 12n);
  assert.equal(result.messages[9].uid, 3n);
  assert.equal(result.mailboxStateUnchanged, true);
  assert.deepEqual(result.folders[0].flags, ["\\HasNoChildren"]);
  assert.equal(client.calls.at(-1), "logout");

  const json = safeJsonStringify(result, 0);
  assert.match(json, /"uidValidity":"9007199254740993"/);
  assert.match(json, /"uid":"12"/);
  assert.doesNotThrow(() => JSON.parse(json));
});

test("configured multi-mailbox proof runs each identity independently and does not emit credentials", async () => {
  FakeImapFlow.instances = [];
  const env = {
    IONOS_MAILBOXES_JSON: JSON.stringify([
      { id: "primary", emailEnv: "MAIL_A_USER", passwordEnv: "MAIL_A_PASS" },
      { id: "assistant", emailEnv: "MAIL_B_USER", passwordEnv: "MAIL_B_PASS" }
    ]),
    MAIL_A_USER: "private-a@example.test",
    MAIL_A_PASS: "private-a-secret",
    MAIL_B_USER: "private-b@example.test",
    MAIL_B_PASS: "private-b-secret"
  };

  const result = await runConfiguredProof({ env, ImapFlowCtor: FakeImapFlow });
  assert.equal(result.mailboxCount, 2);
  assert.deepEqual(
    result.mailboxes.map((mailbox) => mailbox.mailboxId),
    ["primary", "assistant"]
  );
  assert.equal(FakeImapFlow.instances.length, 2);

  const json = safeJsonStringify(result, 0);
  for (const secret of [
    "private-a@example.test",
    "private-a-secret",
    "private-b@example.test",
    "private-b-secret"
  ]) {
    assert.equal(json.includes(secret), false, secret);
  }
});

test("client errors are redacted before they can expose mailbox credentials", async () => {
  class ThrowingImapFlow extends FakeImapFlow {
    async connect() {
      throw new Error(`authentication failed for ${this.options.auth.user} using ${this.options.auth.pass}`);
    }
  }

  let caught;
  try {
    await runMailboxProof(directConfig(), { ImapFlowCtor: ThrowingImapFlow });
  } catch (error) {
    caught = error;
  }

  assert.ok(caught instanceof Error);
  assert.match(caught.message, /\[REDACTED\]/);
  assert.equal(caught.message.includes("owner@example.test"), false);
  assert.equal(caught.message.includes("secret-pass"), false);
});
