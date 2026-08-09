import crypto from "node:crypto";

import type { DiscoveryQueryV1 } from "@/lib/external-intelligence/targeted-research/targeted-research-contracts-v1";

function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export function planOrganizationContextDiscoveryQueriesV1(input: { organization_name: string }): DiscoveryQueryV1[] {
  const org = input.organization_name.trim();
  if (!org) throw new Error("missing_organization_name");

  const templates: Array<{ template_id: string; query: string }> = [
    { template_id: "org_context.official_site", query: `${org} official site` },
    { template_id: "org_context.about", query: `${org} about` },
    { template_id: "org_context.what_is", query: `${org} what is` }
  ];

  return templates.map((t) => {
    const query_id = `dq_${sha256Hex(JSON.stringify({ v: "dq_v1", template_id: t.template_id, q: t.query })).slice(0, 16)}`;
    return Object.freeze({ query_id, template_id: t.template_id, query: t.query });
  });
}
