import { normalizeIdentity } from "./normalize";

export type ExplicitGraphRef =
  | { kind: "claim"; claimId: string; contentHash?: string | null }
  | { kind: "event"; eventId: string; contentHash?: string | null }
  | { kind: "signal"; signalId: string; contentHash?: string | null }
  | { kind: "evidence"; evidenceReferenceId: string; contentHash?: string | null };

// Intentionally strict patterns: we only accept explicit IDs.
const claimRefRe = /claim\s*id\s*:\s*([a-z0-9_:-]+)(?:@([a-z0-9]{8,128}))?/gi;
const eventRefRe = /event\s*id\s*:\s*([a-z0-9_:-]+)(?:@([a-z0-9]{8,128}))?/gi;
const signalRefRe = /signal\s*id\s*:\s*([a-z0-9_:-]+)(?:@([a-z0-9]{8,128}))?/gi;
const evidenceRefRe = /evidence\s*ref\s*:\s*([a-z0-9_:-]+)(?:@([a-z0-9]{8,128}))?/gi;

export function extractExplicitGraphRefs(text: string | null | undefined): ExplicitGraphRef[] {
  const input = typeof text === "string" ? text : "";
  if (!input.trim()) return [];
  const refs: ExplicitGraphRef[] = [];
  const seen = new Set<string>();

  function push(key: string, ref: ExplicitGraphRef) {
    if (seen.has(key)) return;
    seen.add(key);
    refs.push(ref);
  }

  for (const match of input.matchAll(claimRefRe)) {
    const id = normalizeIdentity(match[1]) ?? match[1];
    push(`claim:${id}@${match[2] ?? ""}`, { kind: "claim", claimId: match[1]!, contentHash: match[2] ?? null });
  }
  for (const match of input.matchAll(eventRefRe)) {
    const id = normalizeIdentity(match[1]) ?? match[1];
    push(`event:${id}@${match[2] ?? ""}`, { kind: "event", eventId: match[1]!, contentHash: match[2] ?? null });
  }
  for (const match of input.matchAll(signalRefRe)) {
    const id = normalizeIdentity(match[1]) ?? match[1];
    push(`signal:${id}@${match[2] ?? ""}`, { kind: "signal", signalId: match[1]!, contentHash: match[2] ?? null });
  }
  for (const match of input.matchAll(evidenceRefRe)) {
    const id = normalizeIdentity(match[1]) ?? match[1];
    push(`evidence:${id}@${match[2] ?? ""}`, { kind: "evidence", evidenceReferenceId: match[1]!, contentHash: match[2] ?? null });
  }

  return refs;
}

