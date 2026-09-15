type RankableOpportunityV1 = {
  status: string;
  source?: string | null;
  value_estimate?: number | null;
  prestige_score?: number | null;
  next_step_due_at?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
};

const STATUS_WEIGHT: Record<string, number> = {
  active_project: 1000,
  contracted: 980,
  negotiating: 940,
  proposal: 920,
  in_conversation: 900,
  waiting_on_contact: 820,
  qualified: 760,
  ready_for_outreach: 600,
  outreach: 580,
  researching: 200,
  research: 200
};

function timestamp(value: string | null | undefined) {
  const parsed = value ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

export function opportunityBusinessPriorityV1(opportunity: RankableOpportunityV1, now = new Date()) {
  const status = opportunity.status.trim().toLowerCase();
  let score = STATUS_WEIGHT[status] ?? 400;
  if (/keegan[_ -]?confirmed|user[_ -]?confirmed/i.test(opportunity.source ?? "")) score += 180;
  if (typeof opportunity.value_estimate === "number" && opportunity.value_estimate > 0) score += Math.min(100, Math.log10(opportunity.value_estimate + 1) * 20);
  score += Math.min(80, (opportunity.prestige_score ?? 0) * 80);

  const updated = timestamp(opportunity.updated_at ?? opportunity.created_at);
  if (updated) {
    const ageDays = Math.max(0, (now.getTime() - updated) / 86_400_000);
    score += Math.max(0, 90 - ageDays * 3);
  }
  return score;
}

export function rankOpportunitiesForBusinessValueV1<T extends RankableOpportunityV1>(opportunities: readonly T[], now = new Date()): T[] {
  return [...opportunities].sort((left, right) =>
    opportunityBusinessPriorityV1(right, now) - opportunityBusinessPriorityV1(left, now) ||
    timestamp(right.updated_at ?? right.created_at) - timestamp(left.updated_at ?? left.created_at)
  );
}
