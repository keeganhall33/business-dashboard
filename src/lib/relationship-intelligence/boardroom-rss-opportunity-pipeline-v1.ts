import type { BoardroomCollectionOutput } from "@/lib/external-intelligence/collection/boardroom/boardroom.adapter";
import {
  BOARDROOM_RSS_URL,
  BOARDROOM_SOURCE_ID,
  BoardroomRssItemSchema,
  type BoardroomRssItem
} from "@/lib/external-intelligence/collection/boardroom/boardroom.contract";
import type { EvidenceReference } from "@/lib/external-intelligence/contracts/evidence-reference";
import {
  classifyBoardroomOpportunitiesV1,
  type BoardroomOpportunityClassifierResultV1,
  type BoardroomStoryV1
} from "@/lib/discovery-intelligence/boardroom-opportunity-classifier-v1";
import {
  projectBoardroomOpportunitiesToIntakeV1,
  type BoardroomOpportunityIntakeProjectionResultV1
} from "@/lib/relationship-intelligence/boardroom-opportunity-intake-projection-v1";

export const BOARDROOM_RSS_OPPORTUNITY_PIPELINE_VERSION_V1 =
  "BOARDROOM_RSS_OPPORTUNITY_PIPELINE_V1" as const;

export type BoardroomRssOpportunitySourceDispositionV1 =
  | "READY_FOR_CLASSIFICATION"
  | "VERIFY_SOURCE_EVIDENCE"
  | "SUPPRESSED_RETRACTED";

export type BoardroomRssOpportunitySourceRecordV1 = Readonly<{
  sourceItemId: string;
  canonicalUrl: string;
  evidenceReferenceId: string | null;
  disposition: BoardroomRssOpportunitySourceDispositionV1;
  reasonCodes: readonly string[];
}>;

export type BoardroomRssOpportunityPipelineInputV1 = Readonly<{
  evaluatedAt: string | Date;
  collection: BoardroomCollectionOutput;
  evidenceReferences: readonly EvidenceReference[];
  maximumEvidenceAgeDays?: number;
  maximumSurfaced?: number;
}>;

export type BoardroomRssOpportunityPipelineResultV1 = Readonly<{
  version: typeof BOARDROOM_RSS_OPPORTUNITY_PIPELINE_VERSION_V1;
  generatedAt: string;
  status: "READY" | "PARTIAL" | "BLOCKED";
  issues: readonly string[];
  records: readonly BoardroomRssOpportunitySourceRecordV1[];
  stories: readonly BoardroomStoryV1[];
  classification: BoardroomOpportunityClassifierResultV1 | null;
  intake: BoardroomOpportunityIntakeProjectionResultV1 | null;
  policies: Readonly<{
    source: "BOARDROOM_RSS";
    sourceIdentity: "EXACT_CANONICAL_URL_AND_SOURCE_ITEM_ID";
    evidenceIdentity: "EXACT_SINGLE_BOARDROOM_EVIDENCE_REFERENCE";
    publicationTime: "EXPLICIT_PUBLISHER_TIMESTAMP_ONLY";
    summary: "EXPLICIT_RSS_EXCERPT_ONLY";
    entityResolution: "NONE_FROM_RSS_TEXT";
    opportunityLinkage: "NONE_FROM_RSS_TEXT";
    relationshipInference: "NONE_FROM_RSS_TEXT";
  }>;
  authority: Readonly<{
    analysisOnly: true;
    externalResearchAuthorized: false;
    crmMutationAuthorized: false;
    relationshipMutationAuthorized: false;
    contactDiscoveryAuthorized: false;
    outreachAuthorized: false;
    spendAuthorized: false;
    contractAuthorized: false;
    externalActionAuthorized: false;
  }>;
  limitations: readonly string[];
}>;

const POLICIES = Object.freeze({
  source: "BOARDROOM_RSS" as const,
  sourceIdentity: "EXACT_CANONICAL_URL_AND_SOURCE_ITEM_ID" as const,
  evidenceIdentity: "EXACT_SINGLE_BOARDROOM_EVIDENCE_REFERENCE" as const,
  publicationTime: "EXPLICIT_PUBLISHER_TIMESTAMP_ONLY" as const,
  summary: "EXPLICIT_RSS_EXCERPT_ONLY" as const,
  entityResolution: "NONE_FROM_RSS_TEXT" as const,
  opportunityLinkage: "NONE_FROM_RSS_TEXT" as const,
  relationshipInference: "NONE_FROM_RSS_TEXT" as const
});

const AUTHORITY = Object.freeze({
  analysisOnly: true as const,
  externalResearchAuthorized: false as const,
  crmMutationAuthorized: false as const,
  relationshipMutationAuthorized: false as const,
  contactDiscoveryAuthorized: false as const,
  outreachAuthorized: false as const,
  spendAuthorized: false as const,
  contractAuthorized: false as const,
  externalActionAuthorized: false as const
});

const LIMITATIONS = Object.freeze([
  "This pipeline connects already-collected Boardroom RSS evidence to the existing Boardroom classifier and canonical opportunity-signal intake projection. It does not fetch Boardroom, read email, browse the web, persist CRM state, or perform external actions.",
  "A publisher story is evidence that Boardroom published the observed title and excerpt. It is not evidence that any named organization, sponsor, athlete, executive, team, or partner is interested in Keegan.",
  "Names and organizations mentioned in RSS text are not converted into canonical entity refs, decision makers, warm paths, sponsorship relationships, contact details, or existing opportunities.",
  "Publication timing is used only when Boardroom supplied an explicit timestamp that exactly matches the canonical evidence reference. Collection time is never substituted for publication, planning, budget, renewal, or outreach timing.",
  "READY_FOR_CLASSIFICATION means the source artifact can enter the deterministic Boardroom classifier. It does not mean qualified opportunity, commercial intent, relationship strength, likelihood, confidence, monetary value, or permission to contact anyone."
] as const);

function freezeDeep<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) freezeDeep(child);
    Object.freeze(value);
  }
  return value as Readonly<T>;
}

function instant(value: string | Date, label: string): string {
  const parsed = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new Error(`${label} must be a valid timestamp`);
  return parsed.toISOString();
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values)].sort((a, b) => a.localeCompare(b)));
}

function requiredMetadataText(value: unknown, label: string): string | null {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  return value.trim();
}

function expectedSourceItemId(item: BoardroomRssItem): string {
  return item.guid ? `guid:${item.guid}` : `url:${item.canonical_url}`;
}

function evidenceIssues(
  item: BoardroomRssItem,
  evidence: EvidenceReference,
  evaluatedAtMs: number
): readonly string[] {
  const issues: string[] = [];
  const expectedItemId = expectedSourceItemId(item);
  const metadata = evidence.provenance_metadata ?? {};

  if (evidence.source_id !== BOARDROOM_SOURCE_ID) issues.push("EVIDENCE_SOURCE_ID_MISMATCH");
  if (evidence.source_config_version !== "v1") issues.push("EVIDENCE_SOURCE_CONFIG_UNSUPPORTED");
  if (evidence.source_url_or_reference !== item.canonical_url) issues.push("EVIDENCE_CANONICAL_URL_MISMATCH");
  if (evidence.source_artifact_identifier !== item.guid) issues.push("EVIDENCE_ARTIFACT_IDENTIFIER_MISMATCH");
  if (evidence.evidence_type !== "report") issues.push("EVIDENCE_TYPE_UNSUPPORTED");
  if (evidence.access_classification !== "public") issues.push("EVIDENCE_ACCESS_NOT_PUBLIC");
  if (evidence.legal_policy_version !== "boardroom.rss.link_only.v1") issues.push("EVIDENCE_LEGAL_POLICY_UNSUPPORTED");
  if (evidence.retention_policy !== "link_only") issues.push("EVIDENCE_RETENTION_POLICY_UNSUPPORTED");
  if (evidence.schema_version !== "evidence_reference_v1") issues.push("EVIDENCE_SCHEMA_VERSION_UNSUPPORTED");
  if (evidence.content_hash == null) issues.push("EVIDENCE_CONTENT_HASH_MISSING");
  if (evidence.correction_status !== "none") issues.push("EVIDENCE_CORRECTION_REQUIRES_REVIEW");
  if (evidence.retraction_status === "retracted") issues.push("EVIDENCE_RETRACTED");
  if (evidence.contradicting_evidence_reference_ids.length > 0) issues.push("EVIDENCE_HAS_CONTRADICTIONS");

  const retrievedAtMs = Date.parse(evidence.retrieved_at);
  if (!Number.isFinite(retrievedAtMs)) issues.push("EVIDENCE_RETRIEVED_AT_INVALID");
  else if (retrievedAtMs > evaluatedAtMs) issues.push("EVIDENCE_RETRIEVED_IN_FUTURE");

  if (item.published_at_iso == null) {
    issues.push("PUBLISHER_TIMESTAMP_MISSING");
  } else {
    const publishedAtMs = Date.parse(item.published_at_iso);
    if (!Number.isFinite(publishedAtMs)) issues.push("PUBLISHER_TIMESTAMP_INVALID");
    else if (publishedAtMs > evaluatedAtMs) issues.push("PUBLISHER_TIMESTAMP_IN_FUTURE");
    if (evidence.published_at !== item.published_at_iso) issues.push("EVIDENCE_PUBLISHED_AT_MISMATCH");
  }

  if (item.excerpt == null || item.excerpt.trim().length === 0) issues.push("RSS_EXCERPT_MISSING");

  if (requiredMetadataText(metadata.canonical_url, "canonical_url") !== item.canonical_url) {
    issues.push("PROVENANCE_CANONICAL_URL_MISMATCH");
  }
  if (requiredMetadataText(metadata.source_item_id, "source_item_id") !== expectedItemId) {
    issues.push("PROVENANCE_SOURCE_ITEM_ID_MISMATCH");
  }
  if (requiredMetadataText(metadata.title, "title") !== item.title) {
    issues.push("PROVENANCE_TITLE_MISMATCH");
  }
  if ((metadata.published_at ?? null) !== item.published_at_iso) {
    issues.push("PROVENANCE_PUBLISHED_AT_MISMATCH");
  }
  if (requiredMetadataText(metadata.collected_at, "collected_at") !== evidence.retrieved_at) {
    issues.push("PROVENANCE_COLLECTION_TIME_MISMATCH");
  }
  if (requiredMetadataText(metadata.feed_url, "feed_url") !== BOARDROOM_RSS_URL) {
    issues.push("PROVENANCE_FEED_URL_MISMATCH");
  }

  return uniqueSorted(issues);
}

function blockedResult(generatedAt: string, issues: readonly string[]): BoardroomRssOpportunityPipelineResultV1 {
  return freezeDeep({
    version: BOARDROOM_RSS_OPPORTUNITY_PIPELINE_VERSION_V1,
    generatedAt,
    status: "BLOCKED" as const,
    issues: uniqueSorted(issues),
    records: [],
    stories: [],
    classification: null,
    intake: null,
    policies: POLICIES,
    authority: AUTHORITY,
    limitations: [...LIMITATIONS]
  });
}

export function compileBoardroomRssOpportunityPipelineV1(
  input: BoardroomRssOpportunityPipelineInputV1
): BoardroomRssOpportunityPipelineResultV1 {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("input must be an object");
  if (!Array.isArray(input.evidenceReferences)) throw new Error("evidenceReferences must be an array");

  const generatedAt = instant(input.evaluatedAt, "evaluatedAt");
  const evaluatedAtMs = Date.parse(generatedAt);

  if (!input.collection || typeof input.collection !== "object" || Array.isArray(input.collection)) {
    throw new Error("collection must be an object");
  }
  if (!input.collection.ok) {
    return blockedResult(generatedAt, ["BOARDROOM_COLLECTION_FAILED"]);
  }
  if (input.collection.source_id !== BOARDROOM_SOURCE_ID) {
    return blockedResult(generatedAt, ["BOARDROOM_COLLECTION_SOURCE_MISMATCH"]);
  }
  if (input.collection.feed.feed_url !== BOARDROOM_RSS_URL) {
    return blockedResult(generatedAt, ["BOARDROOM_COLLECTION_FEED_MISMATCH"]);
  }
  if (!Array.isArray(input.collection.items)) {
    return blockedResult(generatedAt, ["BOARDROOM_COLLECTION_ITEMS_INVALID"]);
  }

  const collectionNowMs = Date.parse(input.collection.meta.now_iso);
  if (!Number.isFinite(collectionNowMs)) return blockedResult(generatedAt, ["BOARDROOM_COLLECTION_TIME_INVALID"]);
  if (collectionNowMs > evaluatedAtMs) return blockedResult(generatedAt, ["BOARDROOM_COLLECTION_TIME_IN_FUTURE"]);
  if (!Number.isInteger(input.collection.meta.max_items) || input.collection.meta.max_items < 0) {
    return blockedResult(generatedAt, ["BOARDROOM_COLLECTION_BOUND_INVALID"]);
  }
  if (!Number.isInteger(input.collection.meta.observed_count) || input.collection.meta.observed_count < input.collection.items.length) {
    return blockedResult(generatedAt, ["BOARDROOM_COLLECTION_COUNT_INVALID"]);
  }
  if (input.collection.items.length > input.collection.meta.max_items) {
    return blockedResult(generatedAt, ["BOARDROOM_COLLECTION_BOUND_EXCEEDED"]);
  }

  const evidenceIds = new Set<string>();
  const evidenceByUrl = new Map<string, EvidenceReference[]>();
  for (const [index, evidence] of input.evidenceReferences.entries()) {
    if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
      throw new Error(`evidenceReferences[${index}] must be an object`);
    }
    if (typeof evidence.evidence_reference_id !== "string" || evidence.evidence_reference_id.trim().length === 0) {
      throw new Error(`evidenceReferences[${index}].evidence_reference_id must be a non-empty string`);
    }
    if (evidenceIds.has(evidence.evidence_reference_id)) {
      return blockedResult(generatedAt, ["DUPLICATE_EVIDENCE_REFERENCE_ID"]);
    }
    evidenceIds.add(evidence.evidence_reference_id);
    const bucket = evidenceByUrl.get(evidence.source_url_or_reference) ?? [];
    bucket.push(evidence);
    evidenceByUrl.set(evidence.source_url_or_reference, bucket);
  }

  const seenSourceItems = new Set<string>();
  const records: BoardroomRssOpportunitySourceRecordV1[] = [];
  const stories: BoardroomStoryV1[] = [];

  for (const [index, rawItem] of input.collection.items.entries()) {
    const parsed = BoardroomRssItemSchema.safeParse(rawItem);
    if (!parsed.success) {
      return blockedResult(generatedAt, [`BOARDROOM_ITEM_${index}_SCHEMA_INVALID`]);
    }
    const item = parsed.data;
    const sourceItemId = expectedSourceItemId(item);
    if (seenSourceItems.has(sourceItemId)) return blockedResult(generatedAt, ["DUPLICATE_BOARDROOM_SOURCE_ITEM_ID"]);
    seenSourceItems.add(sourceItemId);

    const candidates = (evidenceByUrl.get(item.canonical_url) ?? []).filter(
      (evidence) => evidence.source_id === BOARDROOM_SOURCE_ID
    );
    if (candidates.length !== 1) {
      records.push(
        freezeDeep({
          sourceItemId,
          canonicalUrl: item.canonical_url,
          evidenceReferenceId: null,
          disposition: "VERIFY_SOURCE_EVIDENCE" as const,
          reasonCodes: [candidates.length === 0 ? "EXACT_BOARDROOM_EVIDENCE_MISSING" : "MULTIPLE_BOARDROOM_EVIDENCE_REFERENCES"]
        })
      );
      continue;
    }

    const evidence = candidates[0];
    const issues = evidenceIssues(item, evidence, evaluatedAtMs);
    if (issues.includes("EVIDENCE_RETRACTED")) {
      records.push(
        freezeDeep({
          sourceItemId,
          canonicalUrl: item.canonical_url,
          evidenceReferenceId: evidence.evidence_reference_id,
          disposition: "SUPPRESSED_RETRACTED" as const,
          reasonCodes: issues
        })
      );
      continue;
    }
    if (issues.length > 0) {
      records.push(
        freezeDeep({
          sourceItemId,
          canonicalUrl: item.canonical_url,
          evidenceReferenceId: evidence.evidence_reference_id,
          disposition: "VERIFY_SOURCE_EVIDENCE" as const,
          reasonCodes: issues
        })
      );
      continue;
    }

    records.push(
      freezeDeep({
        sourceItemId,
        canonicalUrl: item.canonical_url,
        evidenceReferenceId: evidence.evidence_reference_id,
        disposition: "READY_FOR_CLASSIFICATION" as const,
        reasonCodes: ["EXACT_BOARDROOM_SOURCE_EVIDENCE_BOUND"]
      })
    );
    stories.push(
      freezeDeep({
        storyId: sourceItemId,
        title: item.title,
        summary: item.excerpt!,
        publishedAt: item.published_at_iso!,
        sourceRef: item.canonical_url,
        evidenceRefs: [evidence.evidence_reference_id],
        evidenceState: "KNOWN" as const,
        entityRefs: [],
        organizationRefs: [],
        syndicationKey: item.guid,
        existingOpportunityRef: null
      })
    );
  }

  const classification = classifyBoardroomOpportunitiesV1({
    stories,
    now: generatedAt,
    maximumEvidenceAgeDays: input.maximumEvidenceAgeDays,
    maximumSurfaced: input.maximumSurfaced
  });
  const intake = projectBoardroomOpportunitiesToIntakeV1({
    projectedAt: generatedAt,
    classifier: classification
  });

  const sourceVerificationCount = records.filter((record) => record.disposition === "VERIFY_SOURCE_EVIDENCE").length;
  const status = sourceVerificationCount > 0 ? "PARTIAL" : "READY";
  const issues = sourceVerificationCount > 0 ? ["SOURCE_EVIDENCE_REVIEW_REQUIRED"] : [];

  return freezeDeep({
    version: BOARDROOM_RSS_OPPORTUNITY_PIPELINE_VERSION_V1,
    generatedAt,
    status,
    issues,
    records,
    stories,
    classification,
    intake,
    policies: POLICIES,
    authority: AUTHORITY,
    limitations: [...LIMITATIONS]
  });
}
