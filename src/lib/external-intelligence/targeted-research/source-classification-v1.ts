import type {
  ExternalSourceClassV1,
  OfficialDomainConfidenceV1
} from "@/lib/external-intelligence/targeted-research/targeted-research-contracts-v1";

function hostLooksLikeOfficialForOrg(input: { domain: string; org_name: string }): boolean {
  const d = input.domain.toLowerCase();
  const key = input.org_name.toLowerCase().replace(/\s+/g, "");
  return d.includes(key) || d.replace(/\./g, "").includes(key);
}

export function classifySourceCandidateV1(input: {
  canonical_url: string;
  domain: string;
  org_name: string;
  title: string | null;
}): { source_class: ExternalSourceClassV1; official_domain_confidence: OfficialDomainConfidenceV1 } {
  // Conservative: we do NOT promote to official purely from similarity.
  const looksLikeOfficial = hostLooksLikeOfficialForOrg({ domain: input.domain, org_name: input.org_name });

  const path = (() => {
    try {
      return new URL(input.canonical_url).pathname.toLowerCase();
    } catch {
      return "";
    }
  })();

  // Basic page-type hints.
  const isNewsroom = path.includes("/news") || path.includes("/press") || path.includes("/media");
  const isEvent = path.includes("/event") || path.includes("/calendar");
  const isPartner = path.includes("/partner") || path.includes("/partners") || path.includes("/sponsor");

  // Initial classification based on URL structure only.
  let source_class: ExternalSourceClassV1 = "UNKNOWN";
  if (looksLikeOfficial) {
    source_class = "OFFICIAL_WEBSITE";
    if (isNewsroom) source_class = "OFFICIAL_NEWSROOM";
    else if (isEvent) source_class = "OFFICIAL_EVENT_PAGE";
    else if (isPartner) source_class = "OFFICIAL_PARTNER_PAGE";
  }

  // Slightly boost confidence if title contains org name (still not high without fetch).
  const title = (input.title ?? "").toLowerCase();
  const org = input.org_name.toLowerCase();
  const titleMatches = title.includes(org);

  const confidence: OfficialDomainConfidenceV1 =
    looksLikeOfficial && titleMatches ? "medium" : looksLikeOfficial ? "low" : "unknown";

  return { source_class, official_domain_confidence: confidence };
}
