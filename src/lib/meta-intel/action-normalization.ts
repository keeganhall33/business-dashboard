import type { MetaAction, NormalizedActionMetricKey, NormalizedActionMetrics } from "./types.ts";

const ACTION_SEMANTICS_VERSION = "meta-actions-v1";

type MetricSpec = {
  key: NormalizedActionMetricKey;
  source: "actions" | "action_values";
  kind: "count" | "value";
  aliases: string[];
};

const METRIC_SPECS: MetricSpec[] = [
  {
    key: "purchases",
    source: "actions",
    kind: "count",
    aliases: [
      "offsite_conversion.fb_pixel_purchase",
      "offsite_conversion.purchase",
      "onsite_conversion.purchase",
      "purchase_conversion",
      "purchase"
    ]
  },
  {
    key: "purchase_value",
    source: "action_values",
    kind: "value",
    aliases: [
      "offsite_conversion.fb_pixel_purchase",
      "offsite_conversion.purchase",
      "onsite_conversion.purchase",
      "purchase_conversion",
      "purchase"
    ]
  },
  {
    key: "add_to_cart",
    source: "actions",
    kind: "count",
    aliases: [
      "offsite_conversion.fb_pixel_add_to_cart",
      "offsite_conversion.add_to_cart",
      "onsite_conversion.add_to_cart",
      "add_to_cart"
    ]
  },
  {
    key: "initiate_checkout",
    source: "actions",
    kind: "count",
    aliases: [
      "offsite_conversion.fb_pixel_initiate_checkout",
      "offsite_conversion.initiate_checkout",
      "onsite_conversion.initiate_checkout",
      "initiate_checkout"
    ]
  },
  {
    key: "landing_page_views",
    source: "actions",
    kind: "count",
    aliases: ["landing_page_view", "landing_page_views", "onsite_conversion.post_save_link_click"]
  },
  {
    key: "video_views",
    source: "actions",
    kind: "count",
    aliases: ["video_view", "video_views", "video_play", "video_plays", "thruplay"]
  }
];

type ResolvedAlias = {
  value: number;
  alias: string;
};

const EPSILON = 1e-6;

export function normalizeMetaActions(
  actions?: MetaAction[] | null,
  actionValues?: MetaAction[] | null
): NormalizedActionMetrics {
  const safeActions = Array.isArray(actions) ? actions.filter(Boolean) : [];
  const safeActionValues = Array.isArray(actionValues) ? actionValues.filter(Boolean) : [];

  const result: NormalizedActionMetrics = {
    semanticsVersion: ACTION_SEMANTICS_VERSION,
    values: {
      purchases: null,
      purchase_value: null,
      add_to_cart: null,
      initiate_checkout: null,
      landing_page_views: null,
      video_views: null
    },
    aliasMap: {
      purchases: null,
      purchase_value: null,
      add_to_cart: null,
      initiate_checkout: null,
      landing_page_views: null,
      video_views: null
    },
    conflicts: [],
    warnings: []
  };

  for (const spec of METRIC_SPECS) {
    const source = spec.source === "actions" ? safeActions : safeActionValues;
    const resolved = pickAliasValue(source, spec);
    if (resolved.conflict) {
      result.conflicts.push({
        metric: spec.key,
        aliases: resolved.conflict.aliases,
        values: resolved.conflict.values
      });
      result.warnings.push(resolved.conflict.message);
      result.values[spec.key] = null;
      result.aliasMap[spec.key] = null;
      continue;
    }
    result.values[spec.key] = resolved.value;
    result.aliasMap[spec.key] = resolved.alias ?? null;
    if (resolved.warning) {
      result.warnings.push(resolved.warning);
    }
  }

  const purchaseAlias = result.aliasMap.purchases;
  const purchaseValueAlias = result.aliasMap.purchase_value;
  if (result.values.purchases !== null && result.values.purchase_value !== null) {
    if (!purchaseAlias || !purchaseValueAlias || purchaseAlias !== purchaseValueAlias) {
      result.warnings.push(
        "Purchase count/value aliases mismatched; dropping purchase metrics for safety"
      );
      result.values.purchases = null;
      result.aliasMap.purchases = null;
      result.values.purchase_value = null;
      result.aliasMap.purchase_value = null;
    }
  }

  return result;
}

function pickAliasValue(source: MetaAction[], spec: MetricSpec): {
  value: number | null;
  alias?: string;
  warning?: string;
  conflict?: { aliases: [string, string]; values: [number, number]; message: string };
} {
  const seen: ResolvedAlias[] = [];
  for (const alias of spec.aliases) {
    const entry = source.find((item) => item?.action_type === alias);
    if (!entry) continue;
    const numericValue = spec.kind === "count" ? coerceCount(entry) : coerceValue(entry);
    if (numericValue === null) continue;
    seen.push({ alias, value: numericValue });
    if (seen.length > 1) {
      const [first] = seen;
      if (!approximatelyEqual(first.value, numericValue)) {
        return {
          value: null,
          conflict: {
            aliases: [first.alias, alias],
            values: [first.value, numericValue],
            message: `Conflicting values for ${spec.key}: ${first.alias}=${first.value} vs ${alias}=${numericValue}`
          }
        };
      }
    }
  }

  if (!seen.length) {
    return { value: null };
  }

  const winner = seen[0];
  if (winner.value < 0) {
    return {
      value: null,
      warning: `Negative value dropped for ${spec.key} (${winner.alias})`
    };
  }

  return { value: winner.value, alias: winner.alias };
}

function approximatelyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) <= EPSILON;
}

function coerceCount(entry: MetaAction): number | null {
  const value = readPrimaryValue(entry);
  if (value === null) return null;
  const rounded = Math.round(value);
  return rounded >= 0 ? rounded : null;
}

function coerceValue(entry: MetaAction): number | null {
  const value = readPrimaryValue(entry);
  if (value === null) return null;
  if (!Number.isFinite(value)) return null;
  const rounded = Math.round(value * 10000) / 10000;
  return rounded >= 0 ? rounded : null;
}

function readPrimaryValue(entry: MetaAction): number | null {
  const candidates: Array<string | number | null | undefined> = [
    entry?.value,
    entry?.action_value,
    entry?.inline_value,
    entry?.["7d_click"],
    entry?.["1d_view"]
  ];
  for (const raw of candidates) {
    if (raw === undefined || raw === null) continue;
    const numeric = typeof raw === "number" ? raw : Number(raw);
    if (Number.isFinite(numeric)) return numeric;
  }
  return null;
}
