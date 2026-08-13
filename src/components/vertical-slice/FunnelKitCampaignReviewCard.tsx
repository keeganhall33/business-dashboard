import { VerticalSliceCard, Pill, DefinitionRow } from "@/components/vertical-slice/VerticalSliceCard";

export type FunnelKitDraftModeV1 = "DRAFT" | "TEST" | "UNKNOWN";

export type FunnelKitCampaignReviewV1 = {
  campaign_id: string;
  name: string;
  goal: string;

  mode: FunnelKitDraftModeV1;
  live_send_enabled: false; // hard UI contract for this slice

  audience: {
    include_tags: string[];
    exclude_tags: string[];
    required_custom_fields: string[];
  };

  assets: {
    automations: Array<{ name: string; status: "draft" | "unknown" }>;
    emails: Array<{ subject: string; status: "draft" | "unknown" }>;
  };

  blockers: string[];
  unknowns: string[];
};

export function FunnelKitCampaignReviewCard({ campaign }: { campaign: FunnelKitCampaignReviewV1 }) {
  const modeLabel = campaign.mode === "DRAFT" ? "Draft" : campaign.mode === "TEST" ? "Test" : "Unknown";

  return (
    <VerticalSliceCard title="FunnelKit campaign review" subtitle="Read-only review surface (no provisioning; no activation).">
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone={campaign.mode === "UNKNOWN" ? "amber" : "zinc"}>Mode: {modeLabel}</Pill>
        <Pill tone="rose">LIVE SEND: DISABLED</Pill>
      </div>

      <div className="mt-4 space-y-2">
        <DefinitionRow label="Name" value={campaign.name} />
        <DefinitionRow label="Goal" value={campaign.goal} />
        <DefinitionRow label="Campaign id" value={campaign.campaign_id} />
      </div>

      <div className="mt-6 space-y-3">
        <div className="text-xs font-semibold uppercase tracking-[0.35em] text-zinc-500">Audience (planned)</div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <DefinitionRow label="Include tags" value={campaign.audience.include_tags.length ? campaign.audience.include_tags.join(", ") : "None"} />
          <DefinitionRow label="Exclude tags" value={campaign.audience.exclude_tags.length ? campaign.audience.exclude_tags.join(", ") : "None"} />
          <DefinitionRow
            label="Required fields"
            value={
              campaign.audience.required_custom_fields.length
                ? campaign.audience.required_custom_fields.join(", ")
                : "None"
            }
          />
        </div>
      </div>

      <div className="mt-6 space-y-3">
        <div className="text-xs font-semibold uppercase tracking-[0.35em] text-zinc-500">Assets (draft/test)</div>
        <ul className="space-y-1 text-sm text-zinc-300">
          {campaign.assets.automations.map((a) => (
            <li key={`auto:${a.name}`}>
              Automation: {a.name} · {a.status}
            </li>
          ))}
          {campaign.assets.emails.map((e) => (
            <li key={`email:${e.subject}`}>
              Email: {e.subject} · {e.status}
            </li>
          ))}
        </ul>
      </div>

      {(campaign.blockers.length > 0 || campaign.unknowns.length > 0) && (
        <div className="mt-6 space-y-3">
          <div className="text-xs font-semibold uppercase tracking-[0.35em] text-zinc-500">Visibility</div>
          {campaign.blockers.length > 0 && (
            <div className="text-sm text-rose-200">
              <div className="font-semibold">Blockers</div>
              <ul className="list-disc space-y-1 pl-5">
                {campaign.blockers.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </div>
          )}
          {campaign.unknowns.length > 0 && (
            <div className="text-sm text-amber-200">
              <div className="font-semibold">Unknowns</div>
              <ul className="list-disc space-y-1 pl-5">
                {campaign.unknowns.map((u) => (
                  <li key={u}>{u}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </VerticalSliceCard>
  );
}

export function buildFunnelKitCampaignReviewFixtureV1(): FunnelKitCampaignReviewV1 {
  return {
    campaign_id: "fk_test_campaign_001",
    name: "VIP Collector Re-Engagement (Draft)",
    goal: "Re-engage high-value collectors with a draft email sequence (no live send)",
    mode: "TEST",
    live_send_enabled: false,
    audience: {
      include_tags: ["collector_vip", "past_buyer"],
      exclude_tags: ["do_not_email"],
      required_custom_fields: ["first_name", "last_purchase_date"]
    },
    assets: {
      automations: [{ name: "VIP Re-Engage Sequence", status: "draft" }],
      emails: [{ subject: "A private preview (draft)", status: "draft" }]
    },
    blockers: ["LIVE_SEND_ENABLED=false (hard gate)"],
    unknowns: ["FunnelKit automation id not provisioned (fixture)" ]
  };
}
