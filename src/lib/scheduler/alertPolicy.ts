import { getSupabaseServerClient } from "@/lib/supabase/server";

export type AlertEligibility =
  | "eligible_for_alert_only"
  | "grouped_only"
  | "manual_review_only"
  | "suppressed"
  | "blocked";

export type AlertPolicyCategory = {
  name: string;
  description?: string;
  reason?: string;
  classification: AlertEligibility;
  patterns: RegExp[];
};

export type AlertPolicy = {
  meta: {
    maxAlertsPerRun: number;
    cooldownHours: number;
  };
  categories: AlertPolicyCategory[];
  fallback: AlertEligibility;
};

const defaultPolicy: AlertPolicy = {
  meta: {
    maxAlertsPerRun: 3,
    cooldownHours: 24
  },
  categories: [
    {
      name: "stale_critical_task",
      description: "High-severity backlog tied to revenue/partnership",
      reason: "High-severity backlog",
      classification: "eligible_for_alert_only",
      patterns: [
        /research 25 prestige-fit targets/i,
        /design premium pricing architecture/i,
        /critical tasks stale/i
      ]
    },
    {
      name: "conversion_hygiene",
      description: "Recurring hygiene (AOV/cart/conversion)",
      reason: "Recurring hygiene",
      classification: "grouped_only",
      patterns: [
        /respond to active brand conversations/i,
        /respond to website conversion rate/i,
        /respond to average order value/i,
        /respond to cart/i,
        /audit checkout/i
      ]
    },
    {
      name: "stalled_opportunity",
      reason: "Pipeline items need context",
      classification: "manual_review_only",
      patterns: [/stalled opportunity/i]
    },
    {
      name: "pending_approvals",
      reason: "Requires operator approval",
      classification: "manual_review_only",
      patterns: [/pending approvals/i]
    }
  ],
  fallback: "manual_review_only"
};

let cachedPolicy: AlertPolicy | null = null;

export async function getAlertPolicy(): Promise<AlertPolicy> {
  if (cachedPolicy) return cachedPolicy;
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("system_state")
    .select("value_json")
    .eq("key", "scheduler_alert_policy")
    .maybeSingle();

  if (error) throw error;

  if (!data?.value_json) {
    await supabase
      .from("system_state")
      .upsert({ key: "scheduler_alert_policy", value_json: defaultPolicy }, { onConflict: "key" });
    cachedPolicy = defaultPolicy;
    return defaultPolicy;
  }

  cachedPolicy = data.value_json as AlertPolicy;
  return cachedPolicy;
}

export function classifyAlertTitle(title: string) {
  const policy = cachedPolicy ?? defaultPolicy;
  const normalized = title.toLowerCase();
  for (const category of policy.categories) {
    if (category.patterns.some((pattern) => pattern.test(normalized))) {
      return { category: category.name, classification: category.classification, reason: category.reason };
    }
  }
  return { category: "fallback", classification: policy.fallback };
}
