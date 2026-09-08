import assert from "node:assert/strict";
import test from "node:test";

import {
  buildIonosMailboxReadinessV1,
  resolveIonosMailboxConfigV1,
  validateIonosMailboxConfigV1
} from "@/lib/email/ionos-mailbox-config-v1";

const validConfig = [
  {
    id: "personal",
    role: "PERSONAL_HIGH_VALUE_RELATIONSHIP",
    emailRef: "op://Business/Personal Mailbox/email",
    passwordRef: "op://Business/Personal Mailbox/app-password"
  },
  {
    id: "assistant",
    role: "ASSISTANT_CUSTOMER_SERVICE_OUTREACH",
    emailRef: "op://Business/Assistant Mailbox/email",
    passwordRef: "op://Business/Assistant Mailbox/app-password",
    folder: "INBOX"
  },
  {
    id: "marketing",
    role: "MARKETING_FUNNELKIT",
    emailRef: "op://Business/Marketing Mailbox/email",
    passwordRef: "op://Business/Marketing Mailbox/app-password",
    host: "imap.ionos.com",
    port: 993,
    tlsMinVersion: "TLSv1.3"
  }
] as const;

function resolverMap() {
  return new Map<string, string>([
    ["op://Business/Personal Mailbox/email", "personal@example.test"],
    ["op://Business/Personal Mailbox/app-password", "personal-secret"],
    ["op://Business/Assistant Mailbox/email", "assistant@example.test"],
    ["op://Business/Assistant Mailbox/app-password", "assistant-secret"],
    ["op://Business/Marketing Mailbox/email", "marketing@example.test"],
    ["op://Business/Marketing Mailbox/app-password", "marketing-secret"]
  ]);
}

test("validates exactly three unique mailbox identities and roles with 1Password references", () => {
  const parsed = validateIonosMailboxConfigV1(validConfig);

  assert.equal(parsed.length, 3);
  assert.deepEqual(parsed.map((mailbox) => mailbox.id), ["personal", "assistant", "marketing"]);
  assert.deepEqual(parsed.map((mailbox) => mailbox.role), [
    "PERSONAL_HIGH_VALUE_RELATIONSHIP",
    "ASSISTANT_CUSTOMER_SERVICE_OUTREACH",
    "MARKETING_FUNNELKIT"
  ]);
  assert.equal(parsed[0]?.host, "imap.ionos.com");
  assert.equal(parsed[0]?.port, 993);
  assert.equal(parsed[0]?.folder, "INBOX");
  assert.equal(parsed[0]?.tlsMinVersion, "TLSv1.2");
  assert.equal(parsed[2]?.tlsMinVersion, "TLSv1.3");
});

test("resolves credentials only through the injected runtime boundary and keeps SMTP disabled", async () => {
  const secrets = resolverMap();
  const requested: string[] = [];

  const resolved = await resolveIonosMailboxConfigV1(validConfig, async (reference) => {
    requested.push(reference);
    const value = secrets.get(reference);
    if (!value) throw new Error("missing test secret");
    return value;
  });

  assert.equal(requested.length, 6);
  assert.equal(resolved.length, 3);
  assert.equal(resolved[0]?.user, "personal@example.test");
  assert.equal(resolved[0]?.pass, "personal-secret");
  assert.equal(resolved[1]?.user, "assistant@example.test");
  assert.equal(resolved[2]?.user, "marketing@example.test");
  assert.equal(resolved.every((mailbox) => mailbox.smtpEnabled === false), true);
});

test("redacted readiness diagnostics expose roles and transport readiness but no secret references or values", () => {
  const readiness = buildIonosMailboxReadinessV1(validConfig);
  const serialized = JSON.stringify(readiness);

  assert.equal(readiness.length, 3);
  assert.equal(readiness.every((mailbox) => mailbox.emailReferenceConfigured), true);
  assert.equal(readiness.every((mailbox) => mailbox.passwordReferenceConfigured), true);
  assert.equal(readiness.every((mailbox) => mailbox.smtpEnabled === false), true);
  assert.match(serialized, /PERSONAL_HIGH_VALUE_RELATIONSHIP/);
  assert.match(serialized, /ASSISTANT_CUSTOMER_SERVICE_OUTREACH/);
  assert.match(serialized, /MARKETING_FUNNELKIT/);
  assert.doesNotMatch(serialized, /op:\/\//);
  assert.doesNotMatch(serialized, /personal-secret|assistant-secret|marketing-secret/);
  assert.doesNotMatch(serialized, /example\.test/);
});

test("fails closed on plaintext credential keys, unsupported fields, and non-1Password references", () => {
  const withPlaintext = validConfig.map((entry) => ({ ...entry })) as Array<Record<string, unknown>>;
  withPlaintext[0] = { ...withPlaintext[0], password: "do-not-accept" };
  assert.throws(() => validateIonosMailboxConfigV1(withPlaintext), /unsupported keys: password/);

  const withSmtp = validConfig.map((entry) => ({ ...entry })) as Array<Record<string, unknown>>;
  withSmtp[1] = { ...withSmtp[1], smtpEnabled: true };
  assert.throws(() => validateIonosMailboxConfigV1(withSmtp), /unsupported keys: smtpEnabled/);

  const withEnvReference = validConfig.map((entry) => ({ ...entry })) as Array<Record<string, unknown>>;
  withEnvReference[2] = { ...withEnvReference[2], passwordRef: "IONOS_PASSWORD" };
  assert.throws(() => validateIonosMailboxConfigV1(withEnvReference), /must be a 1Password op:\/\/ secret reference/);
});

test("fails closed on duplicate identities, role overlap, missing roles, and malformed config cardinality", () => {
  const duplicateId = validConfig.map((entry) => ({ ...entry })) as Array<Record<string, unknown>>;
  duplicateId[1] = { ...duplicateId[1], id: "personal" };
  assert.throws(() => validateIonosMailboxConfigV1(duplicateId), /Duplicate mailbox id personal/);

  const duplicateRole = validConfig.map((entry) => ({ ...entry })) as Array<Record<string, unknown>>;
  duplicateRole[2] = { ...duplicateRole[2], role: "ASSISTANT_CUSTOMER_SERVICE_OUTREACH" };
  assert.throws(() => validateIonosMailboxConfigV1(duplicateRole), /Duplicate mailbox role ASSISTANT_CUSTOMER_SERVICE_OUTREACH/);

  assert.throws(() => validateIonosMailboxConfigV1(validConfig.slice(0, 2)), /must contain exactly 3 mailboxes/);
  assert.throws(() => validateIonosMailboxConfigV1([...validConfig, validConfig[0]]), /must contain exactly 3 mailboxes/);
});

test("secret-resolution failures and malformed resolved credentials do not expose references or secret values", async () => {
  await assert.rejects(
    () =>
      resolveIonosMailboxConfigV1(validConfig, async (reference) => {
        if (reference.includes("Personal Mailbox/email")) {
          throw new Error(`provider failed for ${reference} with leaked-secret-value`);
        }
        return "unused@example.test";
      }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.message, "Failed to resolve email reference for mailbox personal");
      assert.doesNotMatch(error.message, /op:\/\/|leaked-secret-value/);
      return true;
    }
  );

  const secrets = resolverMap();
  secrets.set("op://Business/Personal Mailbox/email", "not-an-email");
  await assert.rejects(
    () => resolveIonosMailboxConfigV1(validConfig, async (reference) => secrets.get(reference) ?? ""),
    /Resolved email credential is invalid for mailbox personal/
  );

  secrets.set("op://Business/Personal Mailbox/email", "personal@example.test");
  secrets.set("op://Business/Personal Mailbox/app-password", "");
  await assert.rejects(
    () => resolveIonosMailboxConfigV1(validConfig, async (reference) => secrets.get(reference) ?? ""),
    /Resolved password credential is invalid for mailbox personal/
  );
});
