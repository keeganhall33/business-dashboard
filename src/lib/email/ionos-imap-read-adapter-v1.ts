import { ImapFlow } from "imapflow";

import type {
  EmailMetadataV1,
  EmailProviderAdapterV1,
  EmailReadSessionV1
} from "@/lib/email/ionos-incremental-sync-v1";
import type { IonosMailboxRuntimeV1 } from "@/lib/email/ionos-mailbox-config-v1";

type ImapClientLike = {
  connect(): Promise<unknown>;
  mailboxOpen(path: string, options: { readOnly: true }): Promise<unknown>;
  status(path: string, query: { uidValidity: true; uidNext: true }): Promise<{
    uidValidity?: string | number | bigint;
    uidNext?: string | number | bigint;
  }>;
  fetch(
    range: string,
    query: { uid: true; envelope: true; internalDate: true; size: true },
    options: { uid: true }
  ): AsyncIterable<{
    uid?: string | number | bigint;
    envelope?: { messageId?: string | null } | null;
    internalDate?: string | Date | null;
    size?: number | null;
  }>;
  logout(): Promise<unknown>;
};

type ImapFlowConstructor = new (options: {
  host: string;
  port: number;
  secure: true;
  tls: { minVersion: "TLSv1.2" | "TLSv1.3" };
  auth: { user: string; pass: string };
  logger: false;
}) => ImapClientLike;

function canonicalUid(value: unknown, label: string): string {
  if (typeof value === "bigint" && value >= BigInt(0)) return value.toString();
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return String(value);
  if (typeof value === "string" && /^(0|[1-9]\d*)$/.test(value)) return BigInt(value).toString();
  throw new Error(`${label} must be a non-negative decimal UID`);
}

function positiveInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  return value;
}

function redactedMessage(error: unknown, mailbox: IonosMailboxRuntimeV1): string {
  let message = error instanceof Error ? error.message : String(error);
  for (const secret of [mailbox.user, mailbox.pass]) {
    if (secret) message = message.split(secret).join("[REDACTED]");
  }
  return message.replace(/op:\/\/[^\s]+/gi, "[REDACTED_REFERENCE]");
}

function remainingMs(deadlineAtMs: number, now: () => number): number {
  const current = now();
  if (!Number.isSafeInteger(deadlineAtMs) || !Number.isSafeInteger(current) || current < 0) {
    throw new Error("IONOS_IMAP_DEADLINE_INVALID");
  }
  const remaining = deadlineAtMs - current;
  if (remaining <= 0) throw new Error("IONOS_IMAP_DEADLINE_EXHAUSTED");
  return remaining;
}

async function bounded<T>(
  work: () => Promise<T>,
  deadlineAtMs: number,
  now: () => number
): Promise<T> {
  const timeoutMs = remainingMs(deadlineAtMs, now);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work(),
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("IONOS_IMAP_DEADLINE_EXHAUSTED")), timeoutMs);
        timer.unref?.();
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function normalizedDate(value: unknown): string | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  if (!Number.isFinite(date.getTime())) throw new Error("provider returned an invalid internal date");
  return date.toISOString();
}

function normalizedSize(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error("provider returned an invalid message size");
  }
  return value;
}

export function createIonosImapReadAdapterV1({
  ImapFlowCtor = ImapFlow as unknown as ImapFlowConstructor,
  now = Date.now
}: {
  ImapFlowCtor?: ImapFlowConstructor;
  now?: () => number;
} = {}): EmailProviderAdapterV1 {
  if (typeof ImapFlowCtor !== "function") throw new Error("ImapFlowCtor must be a constructor");
  if (typeof now !== "function") throw new Error("now must be a function");

  return {
    async openReadOnly(mailbox, { deadlineAtMs }) {
      if (mailbox.smtpEnabled !== false) throw new Error("IONOS_IMAP_SMTP_MUST_BE_DISABLED");
      remainingMs(deadlineAtMs, now);

      const client = new ImapFlowCtor({
        host: mailbox.host,
        port: mailbox.port,
        secure: true,
        tls: { minVersion: mailbox.minVersion },
        auth: { user: mailbox.user, pass: mailbox.pass },
        logger: false
      });
      let connected = false;
      let closed = false;

      const cleanup = async () => {
        if (closed) return;
        closed = true;
        if (connected) await client.logout();
      };

      try {
        await bounded(() => client.connect().then(() => undefined), deadlineAtMs, now);
        connected = true;
        await bounded(
          () => client.mailboxOpen(mailbox.folder, { readOnly: true }).then(() => undefined),
          deadlineAtMs,
          now
        );
      } catch (error) {
        try {
          await cleanup();
        } catch {
          // Preserve the primary connection/open failure.
        }
        throw new Error(redactedMessage(error, mailbox));
      }

      const session: EmailReadSessionV1 = {
        async status() {
          try {
            const status = await bounded(
              () => client.status(mailbox.folder, { uidValidity: true, uidNext: true }),
              deadlineAtMs,
              now
            );
            return {
              uidValidity: canonicalUid(status.uidValidity, "provider status.uidValidity"),
              uidNext: canonicalUid(status.uidNext, "provider status.uidNext")
            };
          } catch (error) {
            throw new Error(redactedMessage(error, mailbox));
          }
        },
        async fetchMetadata({ fromUid, toUid, limit }) {
          try {
            const from = canonicalUid(fromUid, "fromUid");
            const to = canonicalUid(toUid, "toUid");
            const boundedLimit = positiveInteger(limit, "limit");
            if (BigInt(from) > BigInt(to)) throw new Error("fromUid must not exceed toUid");
            remainingMs(deadlineAtMs, now);
            const messages: EmailMetadataV1[] = [];
            const iterable = client.fetch(
              `${from}:${to}`,
              { uid: true, envelope: true, internalDate: true, size: true },
              { uid: true }
            );
            for await (const item of iterable) {
              remainingMs(deadlineAtMs, now);
              if (messages.length >= boundedLimit) break;
              const messageId = item.envelope?.messageId;
              messages.push({
                uid: canonicalUid(item.uid, "provider message uid"),
                messageId: typeof messageId === "string" && messageId.trim() ? messageId.trim() : null,
                internalDate: normalizedDate(item.internalDate),
                size: normalizedSize(item.size)
              });
            }
            return { complete: true, messages };
          } catch (error) {
            throw new Error(redactedMessage(error, mailbox));
          }
        },
        async close() {
          if (closed) return;
          const exhausted = (() => {
            try {
              remainingMs(deadlineAtMs, now);
              return false;
            } catch {
              return true;
            }
          })();
          try {
            await cleanup();
          } catch (error) {
            throw new Error(redactedMessage(error, mailbox));
          }
          if (exhausted) throw new Error("IONOS_IMAP_DEADLINE_EXHAUSTED");
        }
      };

      return session;
    }
  };
}
