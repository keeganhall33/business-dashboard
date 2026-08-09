function collapseWhitespace(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

function stripPunctuationForCompare(input: string): string {
  // Keep alphanumerics and spaces; drop most punctuation.
  return input.replace(/[^\p{L}\p{N}\s]+/gu, "");
}

const LEGAL_SUFFIXES = [
  "inc",
  "incorporated",
  "llc",
  "l.l.c",
  "ltd",
  "limited",
  "corp",
  "corporation",
  "co",
  "company",
  "plc",
  "gmbh",
  "ag",
  "sa",
  "s\.a",
  "bv",
  "b\.v"
];

function stripLegalSuffixesForCompare(input: string): string {
  // Comparison-only: do not mutate canonical identity.
  const parts = collapseWhitespace(input).split(" ");
  const lowered = parts.map((p) => p.toLowerCase());

  while (lowered.length) {
    const tail = lowered[lowered.length - 1].replace(/\.+$/g, "");
    if (!LEGAL_SUFFIXES.includes(tail)) break;
    lowered.pop();
  }

  return lowered.join(" ");
}

export type NormalizedOrgNameV1 = {
  raw: string;
  whitespace_collapsed: string;
  compare_key: string;
};

/**
 * Deterministic normalization for candidate suggestion only.
 *
 * Allowed transforms:
 * - trim
 * - collapse whitespace
 * - case-fold
 * - normalize punctuation
 * - strip common legal suffixes (comparison only)
 */
export function normalizeOrganizationNameForCandidateCompareV1(raw: string): NormalizedOrgNameV1 {
  const whitespace_collapsed = collapseWhitespace(raw);
  const lowered = whitespace_collapsed.toLowerCase();
  const noPunct = stripPunctuationForCompare(lowered);
  const stripped = stripLegalSuffixesForCompare(noPunct);
  const compare_key = collapseWhitespace(stripped);

  return { raw, whitespace_collapsed, compare_key };
}
