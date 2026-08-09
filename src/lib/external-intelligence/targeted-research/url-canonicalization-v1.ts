import crypto from "node:crypto";

function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

const TRACKING_PARAMS_PREFIXES = ["utm_"];
const TRACKING_PARAMS = new Set(["gclid", "fbclid"]);

export function canonicalizeUrlV1(raw: string): { canonical_url: string; domain: string } {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error("invalid_url");
  }

  // Normalize scheme/host.
  u.protocol = u.protocol.toLowerCase();
  u.hostname = u.hostname.toLowerCase();

  // Drop fragment (non-semantic for our purposes).
  u.hash = "";

  // Drop common tracking params conservatively.
  const params = new URLSearchParams(u.search);
  for (const key of Array.from(params.keys())) {
    if (TRACKING_PARAMS.has(key)) params.delete(key);
    for (const prefix of TRACKING_PARAMS_PREFIXES) {
      if (key.startsWith(prefix)) params.delete(key);
    }
  }
  u.search = params.toString() ? `?${params.toString()}` : "";

  // Remove default ports.
  if ((u.protocol === "https:" && u.port === "443") || (u.protocol === "http:" && u.port === "80")) {
    u.port = "";
  }

  return { canonical_url: u.toString(), domain: u.hostname };
}

export function computeTargetedWebSourceIdV1(domain: string): string {
  return `research.web.host:${domain}`;
}

export function computeTargetedWebEvidenceReferenceIdV1(input: { source_id: string; canonical_url: string }): string {
  // Deterministic stable id for prospective EvidenceReference.
  const key = `${input.source_id}|${input.canonical_url}`;
  return `ev_${sha256Hex(key).slice(0, 24)}`;
}
