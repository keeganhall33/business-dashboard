export const IONOS_MAILBOX_ROLES_V1 = [
  "PERSONAL_HIGH_VALUE_RELATIONSHIP",
  "ASSISTANT_CUSTOMER_SERVICE_OUTREACH",
  "MARKETING_FUNNELKIT"
] as const;

export type IonosMailboxRoleV1 = (typeof IONOS_MAILBOX_ROLES_V1)[number];

export type IonosMailboxConfigEntryV1 = {
  id: string;
  role: IonosMailboxRoleV1;
  emailRef: string;
  passwordRef: string;
  host?: string;
  port?: number;
  folder?: string;
  tlsMinVersion?: "TLSv1.2" | "TLSv1.3";
};

export type IonosMailboxRuntimeV1 = {
  id: string;
  role: IonosMailboxRoleV1;
  user: string;
  pass: string;
  host: string;
  port: number;
  folder: string;
  minVersion: "TLSv1.2" | "TLSv1.3";
  smtpEnabled: false;
};

export type IonosMailboxReadinessV1 = {
  id: string;
  role: IonosMailboxRoleV1;
  host: string;
  port: number;
  folder: string;
  minVersion: "TLSv1.2" | "TLSv1.3";
  emailReferenceConfigured: true;
  passwordReferenceConfigured: true;
  smtpEnabled: false;
};

const DEFAULT_HOST = "imap.ionos.com";
const DEFAULT_PORT = 993;
const DEFAULT_FOLDER = "INBOX";
const DEFAULT_TLS_MIN_VERSION = "TLSv1.2" as const;

const ALLOWED_KEYS = new Set([
  "id",
  "role",
  "emailRef",
  "passwordRef",
  "host",
  "port",
  "folder",
  "tlsMinVersion"
]);

const ROLE_SET = new Set<string>(IONOS_MAILBOX_ROLES_V1);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function secretReference(value: unknown, label: string): string {
  const ref = requiredString(value, label);
  if (!/^op:\/\/[^\r\n]+$/.test(ref)) {
    throw new Error(`${label} must be a 1Password op:// secret reference`);
  }
  return ref;
}

function mailboxRole(value: unknown, label: string): IonosMailboxRoleV1 {
  const role = requiredString(value, label);
  if (!ROLE_SET.has(role)) {
    throw new Error(`${label} is unsupported`);
  }
  return role as IonosMailboxRoleV1;
}

function portNumber(value: unknown, label: string): number {
  const port = value == null ? DEFAULT_PORT : value;
  if (typeof port !== "number" || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${label} must be an integer between 1 and 65535`);
  }
  return port;
}

function tlsVersion(value: unknown, label: string): "TLSv1.2" | "TLSv1.3" {
  if (value == null) return DEFAULT_TLS_MIN_VERSION;
  if (value !== "TLSv1.2" && value !== "TLSv1.3") {
    throw new Error(`${label} must be TLSv1.2 or TLSv1.3`);
  }
  return value;
}

function normalizeEntry(value: unknown, index: number): Required<IonosMailboxConfigEntryV1> {
  const label = `mailboxes[${index}]`;
  if (!isPlainObject(value)) {
    throw new Error(`${label} must be a plain object`);
  }

  const unknownKeys = Object.keys(value).filter((key) => !ALLOWED_KEYS.has(key));
  if (unknownKeys.length > 0) {
    throw new Error(`${label} contains unsupported keys: ${unknownKeys.join(", ")}`);
  }

  const emailRef = secretReference(value.emailRef, `${label}.emailRef`);
  const passwordRef = secretReference(value.passwordRef, `${label}.passwordRef`);
  if (emailRef === passwordRef) {
    throw new Error(`${label} emailRef and passwordRef must be distinct`);
  }

  return {
    id: requiredString(value.id, `${label}.id`),
    role: mailboxRole(value.role, `${label}.role`),
    emailRef,
    passwordRef,
    host: value.host == null ? DEFAULT_HOST : requiredString(value.host, `${label}.host`),
    port: portNumber(value.port, `${label}.port`),
    folder: value.folder == null ? DEFAULT_FOLDER : requiredString(value.folder, `${label}.folder`),
    tlsMinVersion: tlsVersion(value.tlsMinVersion, `${label}.tlsMinVersion`)
  };
}

export function validateIonosMailboxConfigV1(value: unknown): Required<IonosMailboxConfigEntryV1>[] {
  if (!Array.isArray(value) || value.length !== IONOS_MAILBOX_ROLES_V1.length) {
    throw new Error(`IONOS mailbox config must contain exactly ${IONOS_MAILBOX_ROLES_V1.length} mailboxes`);
  }

  const mailboxes = value.map(normalizeEntry);
  const ids = new Set<string>();
  const roles = new Set<IonosMailboxRoleV1>();

  for (const mailbox of mailboxes) {
    if (ids.has(mailbox.id)) throw new Error(`Duplicate mailbox id ${mailbox.id}`);
    if (roles.has(mailbox.role)) throw new Error(`Duplicate mailbox role ${mailbox.role}`);
    ids.add(mailbox.id);
    roles.add(mailbox.role);
  }

  for (const role of IONOS_MAILBOX_ROLES_V1) {
    if (!roles.has(role)) throw new Error(`Missing mailbox role ${role}`);
  }

  return mailboxes;
}

export function buildIonosMailboxReadinessV1(value: unknown): IonosMailboxReadinessV1[] {
  return validateIonosMailboxConfigV1(value).map((mailbox) => ({
    id: mailbox.id,
    role: mailbox.role,
    host: mailbox.host,
    port: mailbox.port,
    folder: mailbox.folder,
    minVersion: mailbox.tlsMinVersion,
    emailReferenceConfigured: true,
    passwordReferenceConfigured: true,
    smtpEnabled: false
  }));
}

export async function resolveIonosMailboxConfigV1(
  value: unknown,
  resolveSecretRef: (reference: string) => string | Promise<string>
): Promise<IonosMailboxRuntimeV1[]> {
  if (typeof resolveSecretRef !== "function") {
    throw new Error("resolveSecretRef must be a function");
  }

  const mailboxes = validateIonosMailboxConfigV1(value);
  const resolved: IonosMailboxRuntimeV1[] = [];

  for (const mailbox of mailboxes) {
    let user: string;
    let pass: string;

    try {
      user = await resolveSecretRef(mailbox.emailRef);
    } catch {
      throw new Error(`Failed to resolve email reference for mailbox ${mailbox.id}`);
    }

    try {
      pass = await resolveSecretRef(mailbox.passwordRef);
    } catch {
      throw new Error(`Failed to resolve password reference for mailbox ${mailbox.id}`);
    }

    if (typeof user !== "string" || !user.trim() || !user.includes("@")) {
      throw new Error(`Resolved email credential is invalid for mailbox ${mailbox.id}`);
    }
    if (typeof pass !== "string" || pass.length === 0) {
      throw new Error(`Resolved password credential is invalid for mailbox ${mailbox.id}`);
    }

    resolved.push({
      id: mailbox.id,
      role: mailbox.role,
      user: user.trim(),
      pass,
      host: mailbox.host,
      port: mailbox.port,
      folder: mailbox.folder,
      minVersion: mailbox.tlsMinVersion,
      smtpEnabled: false
    });
  }

  return resolved;
}
