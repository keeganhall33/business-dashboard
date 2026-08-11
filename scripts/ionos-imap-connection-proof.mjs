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
  - Fetch exactly 10 recent message headers using BODY.PEEK

  Required env:
    IONOS_EMAIL_ADDRESS
    IONOS_EMAIL_APP_PASSWORD
  Optional env:
    IONOS_IMAP_HOST (default imap.ionos.com)
    IONOS_IMAP_PORT (default 993)
    IONOS_IMAP_TLS_MIN_VERSION (default TLSv1.2)
    IONOS_IMAP_FOLDER (default INBOX)
*/

import tls from "node:tls";
import { ImapFlow } from "imapflow";

function mustEnv(key) {
  const v = process.env[key];
  if (!v) throw new Error(`Missing required env ${key}`);
  return v;
}

function pickEnv(key, fallback) {
  const v = process.env[key];
  return v && v.trim() ? v.trim() : fallback;
}

function safeHeaderValue(v) {
  if (!v) return null;
  if (Array.isArray(v)) return v.map(safeHeaderValue).filter(Boolean).join(", ");
  if (typeof v === "string") return v.replace(/\s+/g, " ").trim();
  return String(v);
}

function formatAddressList(list) {
  if (!Array.isArray(list) || list.length === 0) return null;
  return list
    .map((a) => {
      const name = a?.name ? String(a.name).trim() : "";
      const addr = a?.address ? String(a.address).trim() : "";
      return name && addr ? `${name} <${addr}>` : addr || name || null;
    })
    .filter(Boolean)
    .join(", ");
}

async function main() {
  const user = mustEnv("IONOS_EMAIL_ADDRESS");
  const pass = mustEnv("IONOS_EMAIL_APP_PASSWORD");

  const host = pickEnv("IONOS_IMAP_HOST", "imap.ionos.com");
  const port = Number(pickEnv("IONOS_IMAP_PORT", "993"));
  const folder = pickEnv("IONOS_IMAP_FOLDER", "INBOX");
  const minVersion = pickEnv("IONOS_IMAP_TLS_MIN_VERSION", "TLSv1.2");

  if (!Number.isFinite(port)) throw new Error("IONOS_IMAP_PORT must be a number");
  if (!Object.values(tls).includes && !minVersion) {
    // noop: kept to avoid accidental lint removals
  }

  // Explicitly construct only an IMAP client. No SMTP surface exists in this file.
  const client = new ImapFlow({
    host,
    port,
    secure: true,
    tls: {
      minVersion
    },
    auth: {
      user,
      pass
    },
    logger: false
  });

  await client.connect();

  // LIST folders
  const folders = [];
  for await (const mb of client.list()) {
    folders.push({
      path: mb.path,
      delimiter: mb.delimiter,
      flags: mb.flags
    });
  }

  // Select mailbox read-only
  const pre = await client.status(folder, { messages: true, unseen: true, uidNext: true, uidValidity: true });
  await client.mailboxOpen(folder, { readOnly: true });

  // Fetch exactly 10 most recent messages by UID (best-effort: use range ending at uidNext-1)
  const uidEnd = Math.max(1, (pre.uidNext ?? 1) - 1);
  const uidStart = Math.max(1, uidEnd - 50_000); // wide net; we still cap to 10 results
  const range = `${uidStart}:${uidEnd}`;

  const out = [];
  for await (const msg of client.fetch(range, {
    uid: true,
    envelope: true,
    internalDate: true,
    size: true,
    // BODY.PEEK avoids setting \Seen.
    source: false,
    bodyParts: ["HEADER.FIELDS (MESSAGE-ID DATE FROM TO SUBJECT)"]
  })) {
    // Keep only metadata fields.
    out.push({
      uid: msg.uid,
      messageId: safeHeaderValue(msg.envelope?.messageId),
      date: msg.internalDate ? new Date(msg.internalDate).toISOString() : null,
      from: formatAddressList(msg.envelope?.from),
      to: formatAddressList(msg.envelope?.to),
      subject: safeHeaderValue(msg.envelope?.subject),
      size: msg.size ?? null
    });
  }

  // Sort newest first by UID and take 10.
  out.sort((a, b) => (b.uid ?? 0) - (a.uid ?? 0));
  const ten = out.slice(0, 10);

  const post = await client.status(folder, { messages: true, unseen: true, uidNext: true, uidValidity: true });

  await client.logout();

  console.log(
    JSON.stringify(
      {
        imap: { host, port, secure: true, minVersion },
        folder,
        pre: {
          messages: pre.messages ?? null,
          unseen: pre.unseen ?? null,
          uidNext: pre.uidNext ?? null,
          uidValidity: pre.uidValidity ?? null
        },
        post: {
          messages: post.messages ?? null,
          unseen: post.unseen ?? null,
          uidNext: post.uidNext ?? null,
          uidValidity: post.uidValidity ?? null
        },
        folders,
        messages: ten
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  // Do not log secrets or full error objects that might include credentials.
  const msg = err instanceof Error ? err.message : String(err);
  console.error(msg);
  process.exitCode = 1;
});

