/*
  IONOS IMAP Connection Proof (READ-ONLY)

  Security contract:
  - IMAP only (no SMTP)
  - No STORE / flag mutation
  - No COPY/MOVE
  - No DELETE/EXPUNGE
  - No APPEND
  - No folder mutation
  - Select mailbox read-only
  - Fetch only metadata/envelope fields; no message body fetch

  Single-mailbox env:
    IONOS_EMAIL_ADDRESS
    IONOS_EMAIL_APP_PASSWORD
  Optional:
    IONOS_MAILBOX_ID (default "default")
    IONOS_IMAP_HOST (default imap.ionos.com)
    IONOS_IMAP_PORT (default 993)
    IONOS_IMAP_TLS_MIN_VERSION (default TLSv1.2)
    IONOS_IMAP_FOLDER (default INBOX)

  Multi-mailbox env:
    IONOS_MAILBOXES_JSON

  IONOS_MAILBOXES_JSON must be an array of objects containing only:
    id, emailEnv, passwordEnv, host, port, folder, tlsMinVersion

  emailEnv/passwordEnv are environment-variable NAMES. Plaintext credentials are not
  accepted inside IONOS_MAILBOXES_JSON.
*/

import path from "node:path";
import { fileURLToPath } from "node:url";
import { ImapFlow } from "imapflow";

const DEFAULT_HOST = "imap.ionos.com";
const DEFAULT_PORT = 993;
const DEFAULT_FOLDER = "INBOX";
const DEFAULT_TLS_MIN_VERSION = "TLSv1.2";
const MULTI_CONFIG_KEY = "IONOS_MAILBOXES_JSON";
const MULTI_ALLOWED_KEYS = new Set([
  "id",
  "emailEnv",
  "passwordEnv",
  "host",
  "port",
  "folder",
  "tlsMinVersion"
]);

function nonEmptyString(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function mustEnv(env, key) {
  const value = env[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Missing required env ${key}`);
  }
  return value;
}

function pickEnv(env, key, fallback) {
  const value = env[key];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function parsePort(value, label = "IONOS_IMAP_PORT") {
  const port = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${label} must be an integer between 1 and 65535`);
  }
  return port;
}

function normalizeMailboxConfig(entry, env, index) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw new Error(`IONOS_MAILBOXES_JSON[${index}] must be an object`);
  }

  const unknown = Object.keys(entry).filter((key) => !MULTI_ALLOWED_KEYS.has(key));
  if (unknown.length > 0) {
    throw new Error(`IONOS_MAILBOXES_JSON[${index}] contains unsupported keys: ${unknown.join(", ")}`);
  }

  const id = nonEmptyString(entry.id, `IONOS_MAILBOXES_JSON[${index}].id`);
  const emailEnv = nonEmptyString(entry.emailEnv, `IONOS_MAILBOXES_JSON[${index}].emailEnv`);
  const passwordEnv = nonEmptyString(entry.passwordEnv, `IONOS_MAILBOXES_JSON[${index}].passwordEnv`);

  return {
    id,
    user: mustEnv(env, emailEnv).trim(),
    pass: mustEnv(env, passwordEnv),
    host: entry.host == null ? DEFAULT_HOST : nonEmptyString(entry.host, `IONOS_MAILBOXES_JSON[${index}].host`),
    port: parsePort(entry.port ?? DEFAULT_PORT, `IONOS_MAILBOXES_JSON[${index}].port`),
    folder: entry.folder == null ? DEFAULT_FOLDER : nonEmptyString(entry.folder, `IONOS_MAILBOXES_JSON[${index}].folder`),
    minVersion:
      entry.tlsMinVersion == null
        ? DEFAULT_TLS_MIN_VERSION
        : nonEmptyString(entry.tlsMinVersion, `IONOS_MAILBOXES_JSON[${index}].tlsMinVersion`)
  };
}

export function loadMailboxConfigs(env = process.env) {
  const raw = env[MULTI_CONFIG_KEY];
  if (typeof raw !== "string" || !raw.trim()) {
    return {
      mode: "single",
      mailboxes: [
        {
          id: pickEnv(env, "IONOS_MAILBOX_ID", "default"),
          user: mustEnv(env, "IONOS_EMAIL_ADDRESS").trim(),
          pass: mustEnv(env, "IONOS_EMAIL_APP_PASSWORD"),
          host: pickEnv(env, "IONOS_IMAP_HOST", DEFAULT_HOST),
          port: parsePort(pickEnv(env, "IONOS_IMAP_PORT", String(DEFAULT_PORT))),
          folder: pickEnv(env, "IONOS_IMAP_FOLDER", DEFAULT_FOLDER),
          minVersion: pickEnv(env, "IONOS_IMAP_TLS_MIN_VERSION", DEFAULT_TLS_MIN_VERSION)
        }
      ]
    };
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("IONOS_MAILBOXES_JSON must be valid JSON");
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("IONOS_MAILBOXES_JSON must be a non-empty array");
  }

  const mailboxes = parsed.map((entry, index) => normalizeMailboxConfig(entry, env, index));
  const seen = new Set();
  for (const mailbox of mailboxes) {
    if (seen.has(mailbox.id)) {
      throw new Error(`Duplicate mailbox id ${mailbox.id}`);
    }
    seen.add(mailbox.id);
  }

  return { mode: "multi", mailboxes };
}

function safeHeaderValue(value) {
  if (!value) return null;
  if (Array.isArray(value)) return value.map(safeHeaderValue).filter(Boolean).join(", ");
  if (typeof value === "string") return value.replace(/\s+/g, " ").trim();
  return String(value);
}

function formatAddressList(list) {
  if (!Array.isArray(list) || list.length === 0) return null;
  return list
    .map((address) => {
      const name = address?.name ? String(address.name).trim() : "";
      const addr = address?.address ? String(address.address).trim() : "";
      return name && addr ? `${name} <${addr}>` : addr || name || null;
    })
    .filter(Boolean)
    .join(", ");
}

function uidBigInt(value, fallback = 0n) {
  if (typeof value === "bigint") return value >= 0n ? value : fallback;
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return BigInt(value);
  if (typeof value === "string" && /^\d+$/.test(value.trim())) return BigInt(value.trim());
  return fallback;
}

function uidRangeFromStatus(uidNext) {
  const next = uidBigInt(uidNext, 1n);
  const end = next > 1n ? next - 1n : 1n;
  const start = end > 50_000n ? end - 50_000n : 1n;
  return `${start}:${end}`;
}

function compareUidDescending(a, b) {
  const left = uidBigInt(a?.uid, 0n);
  const right = uidBigInt(b?.uid, 0n);
  if (left === right) return 0;
  return left < right ? 1 : -1;
}

function statusSnapshot(status) {
  return {
    messages: status?.messages ?? null,
    unseen: status?.unseen ?? null,
    uidNext: status?.uidNext ?? null,
    uidValidity: status?.uidValidity ?? null
  };
}

function redactSecrets(text, secrets) {
  let output = String(text);
  for (const secret of secrets) {
    if (typeof secret !== "string" || secret.length === 0) continue;
    output = output.split(secret).join("[REDACTED]");
  }
  return output;
}

export function safeJsonStringify(value, spaces = 2) {
  return JSON.stringify(
    value,
    (_key, item) => (typeof item === "bigint" ? item.toString() : item),
    spaces
  );
}

export async function runMailboxProof(config, { ImapFlowCtor = ImapFlow } = {}) {
  const client = new ImapFlowCtor({
    host: config.host,
    port: config.port,
    secure: true,
    tls: { minVersion: config.minVersion },
    auth: { user: config.user, pass: config.pass },
    logger: false
  });

  let connected = false;
  let primaryError = null;

  try {
    await client.connect();
    connected = true;

    const listed = await client.list();
    if (!Array.isArray(listed)) {
      throw new Error("IMAP list() did not return an array");
    }

    const folders = listed.map((mailbox) => ({
      path: mailbox.path,
      delimiter: mailbox.delimiter,
      flags: mailbox.flags == null ? [] : Array.from(mailbox.flags)
    }));

    const pre = await client.status(config.folder, {
      messages: true,
      unseen: true,
      uidNext: true,
      uidValidity: true
    });

    await client.mailboxOpen(config.folder, { readOnly: true });

    const range = uidRangeFromStatus(pre.uidNext);
    const fetched = client.fetch(
      range,
      {
        uid: true,
        envelope: true,
        internalDate: true,
        size: true
      },
      { uid: true }
    );

    if (!fetched || typeof fetched[Symbol.asyncIterator] !== "function") {
      throw new Error("IMAP fetch() did not return an async iterable");
    }

    const messages = [];
    for await (const message of fetched) {
      messages.push({
        uid: message.uid ?? null,
        messageId: safeHeaderValue(message.envelope?.messageId),
        date: message.internalDate ? new Date(message.internalDate).toISOString() : null,
        from: formatAddressList(message.envelope?.from),
        to: formatAddressList(message.envelope?.to),
        subject: safeHeaderValue(message.envelope?.subject),
        size: message.size ?? null
      });
    }

    messages.sort(compareUidDescending);

    const post = await client.status(config.folder, {
      messages: true,
      unseen: true,
      uidNext: true,
      uidValidity: true
    });

    return {
      mailboxId: config.id,
      imap: {
        host: config.host,
        port: config.port,
        secure: true,
        minVersion: config.minVersion
      },
      folder: config.folder,
      pre: statusSnapshot(pre),
      post: statusSnapshot(post),
      mailboxStateUnchanged: safeJsonStringify(statusSnapshot(pre), 0) === safeJsonStringify(statusSnapshot(post), 0),
      folders,
      messages: messages.slice(0, 10)
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    primaryError = new Error(redactSecrets(message, [config.user, config.pass]));
    throw primaryError;
  } finally {
    if (connected) {
      try {
        await client.logout();
      } catch (error) {
        if (!primaryError) {
          const message = error instanceof Error ? error.message : String(error);
          throw new Error(redactSecrets(message, [config.user, config.pass]));
        }
      }
    }
  }
}

export async function runConfiguredProof({ env = process.env, ImapFlowCtor = ImapFlow } = {}) {
  const config = loadMailboxConfigs(env);
  const results = [];
  for (const mailbox of config.mailboxes) {
    results.push(await runMailboxProof(mailbox, { ImapFlowCtor }));
  }

  if (config.mode === "single") return results[0];
  return {
    mailboxCount: results.length,
    mailboxes: results
  };
}

async function main() {
  const result = await runConfiguredProof();
  console.log(safeJsonStringify(result, 2));
}

const isDirectRun =
  process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isDirectRun) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  });
}
