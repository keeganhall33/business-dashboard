import { z } from "zod";
import { isoDatetimeSchema, nonEmptyTrimmedString, optionalTrimmedString } from "./common";

export const preparedActionCategoryEnum = z.enum([
  "website",
  "product",
  "email",
  "meta",
  "tracking",
  "collector",
  "operations",
  "partnership"
] as const);

export const preparedActionRiskEnum = z.enum(["low", "medium", "high"] as const);
export const preparedActionConfidenceEnum = z.enum(["low", "medium", "high"] as const);
export const preparedActionStatusFilterEnum = z.enum([
  "draft",
  "ready_for_review",
  "approved",
  "rejected",
  "manually_executed",
  "archived"
] as const);

export const preparedActionTransitionEnum = z.enum([
  "ready_for_review",
  "approved",
  "rejected",
  "manually_executed",
  "archived"
] as const);

export const preparedAssetTypeEnum = z.enum([
  "content_post_draft",
  "meta_creative_brief",
  "email_draft",
  "checkout_audit_brief"
] as const);

const evidenceSchema = z.object({
  label: nonEmptyTrimmedString,
  value: optionalTrimmedString,
  url: optionalTrimmedString
});

const preparedAssetSchema = z.object({
  label: nonEmptyTrimmedString,
  value: optionalTrimmedString,
  assetType: preparedAssetTypeEnum.optional(),
  generatedAt: isoDatetimeSchema.optional()
});

export const preparedActionsQuerySchema = z.object({
  status: z.string().optional(),
  category: z.string().optional(),
  riskLevel: preparedActionRiskEnum.optional(),
  sourcePanel: optionalTrimmedString
});

export const createPreparedActionSchema = z
  .object({
    title: nonEmptyTrimmedString,
    category: preparedActionCategoryEnum,
    sourcePanel: nonEmptyTrimmedString,
    sourceInsightId: optionalTrimmedString,
    sourceSnapshotAt: isoDatetimeSchema.optional(),
    sourceUrl: optionalTrimmedString,
    dedupeKey: optionalTrimmedString,
    whyItMatters: nonEmptyTrimmedString,
    evidence: z.array(evidenceSchema).min(1).max(10),
    preparedAsset: z.array(preparedAssetSchema).max(10).optional(),
    estimatedImpact: optionalTrimmedString,
    riskLevel: preparedActionRiskEnum.optional(),
    confidence: preparedActionConfidenceEnum.optional(),
    dataLight: z.boolean().optional(),
    requiredApprovalAction: nonEmptyTrimmedString,
    createdByAgent: nonEmptyTrimmedString,
    expiresAt: isoDatetimeSchema.optional(),
    notes: optionalTrimmedString
  })
  .refine((value) => {
    if (value.sourceInsightId && !value.dedupeKey) {
      return false;
    }
    return true;
  }, { message: "dedupeKey required when sourceInsightId is provided", path: ["dedupeKey"] });

export const updatePreparedActionSchema = z.object({
  status: preparedActionTransitionEnum,
  approvalNote: optionalTrimmedString,
  rejectionReason: optionalTrimmedString,
  manualExecutionNote: optionalTrimmedString,
  notes: optionalTrimmedString
});

export const generatePreparedAssetSchema = z.object({
  assetType: preparedAssetTypeEnum
});

function parseCsvEnum(options: readonly string[], value?: string | null) {
  if (!value) return undefined;
  const allowed = new Set(options);
  const list = value
    .split(",")
    .map((token) => token.trim())
    .filter((token) => allowed.has(token));
  return list.length ? list : undefined;
}

export function parseStatusList(value?: string | null) {
  return parseCsvEnum(preparedActionStatusFilterEnum.options, value) as
    | z.infer<typeof preparedActionStatusFilterEnum>[]
    | undefined;
}

export function parseCategoryList(value?: string | null) {
  return parseCsvEnum(preparedActionCategoryEnum.options, value) as
    | z.infer<typeof preparedActionCategoryEnum>[]
    | undefined;
}
