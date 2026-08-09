export const TARGETED_WEB_BOUNDED_EXCERPT_POLICY_V1 = Object.freeze({
  legal_policy_version: "targeted_web.bounded_excerpt.v1",
  retention_policy: "quote_only" as const,
  // Conservative eligibility: explicitly allowlisted domains only.
  // This avoids assuming all public webpages are eligible for excerpt retention.
  eligible_domains: ["www.sportspro.com"] as const
});

export function isEligibleForTargetedWebBoundedExcerptV1(input: { domain: string }): boolean {
  return (TARGETED_WEB_BOUNDED_EXCERPT_POLICY_V1.eligible_domains as readonly string[]).includes(input.domain.toLowerCase());
}
