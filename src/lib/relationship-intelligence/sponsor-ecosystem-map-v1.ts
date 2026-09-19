import type {
  OpportunityAccessMapV1,
  OpportunityAccessPathNodeV1,
  OpportunityDecisionMakerV1,
  OpportunityPlanningWindowV1,
  OpportunitySponsorshipLinkV1,
  OpportunityWarmAccessPathV1
} from "@/lib/opportunity-intelligence/opportunity-access-map-v1";

export const SPONSOR_ECOSYSTEM_MAP_VERSION = "SPONSOR_ECOSYSTEM_MAP_V1" as const;

export type SponsorEcosystemSideV1 = "PROPERTY" | "SPONSOR";

export type SponsorEcosystemDecisionMakerV1 = Readonly<{
  opportunityId: string;
  side: SponsorEcosystemSideV1;
  personCanonicalId: string;
  personLabel: string;
  organizationCanonicalId: string;
  organizationLabel: string;
  decisionClass: string;
  observedAt: string;
  evidenceRefs: readonly string[];
}>;

export type SponsorEcosystemWarmAccessPathV1 = Readonly<{
  opportunityId: string;
  targetPersonCanonicalId: string;
  targetSide: SponsorEcosystemSideV1;
  path: readonly OpportunityAccessPathNodeV1[];
  reasonForIntroduction: string;
  observedAt: string;
  evidenceRefs: readonly string[];
}>;

export type SponsorEcosystemPlanningWindowV1 = Readonly<{
  opportunityId: string;
  windowType: string;
  windowStart: string;
  windowEnd: string;
  whyThisWindow: string;
  observedAt: string;
  evidenceRefs: readonly string[];
}>;

export type SponsorEcosystemLinkV1 = Readonly<{
  propertyCanonicalId: string;
  propertyLabel: string;
  sponsorCanonicalId: string;
  sponsorLabel: string;
  relationshipLabel: string;
  opportunityIds: readonly string[];
  observedAt: string;
  evidenceRefs: readonly string[];
  decisionMakers: readonly SponsorEcosystemDecisionMakerV1[];
  warmAccessPaths: readonly SponsorEcosystemWarmAccessPathV1[];
}>;

export type SponsorEcosystemMapInputV1 = Readonly<{
  accessMaps: readonly OpportunityAccessMapV1[];
  asOf: string | Date;
}>;

export type SponsorEcosystemMapResultV1 = Readonly<{
  version: typeof SPONSOR_ECOSYSTEM_MAP_VERSION;
  asOf: string;
  ecosystems: readonly SponsorEcosystemLinkV1[];
  opportunityPlanningWindows: readonly SponsorEcosystemPlanningWindowV1[];
  counts: Readonly<{
    opportunitiesReviewed: number;
    sponsorLinks: number;
    propertyDecisionMakers: number;
    sponsorDecisionMakers: number;
    exactWarmAccessPaths: number;
    explicitPlanningWindows: number;
  }>;
  inferredSponsorshipLinks: false;
  inferredDecisionAuthority: false;
  inferredWarmAccess: false;
  inferredContactInfo: false;
  inferredPlanningTiming: false;
  crmMutationPerformed: false;
  externalResearchPerformed: false;
  externalActionPerformed: false;
}>;

function requiredText(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${label} must be a non-empty string`);
  return value.trim();
}

function iso(value: string | Date, label: string): string {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error(`${label} must be a valid timestamp`);
  return date.toISOString();
}

function refs(value: readonly string[], label: string): readonly string[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error(`${label} must be a non-empty array`);
  return Object.freeze(
    [...new Set(value.map((item, index) => requiredText(item, `${label}[${index}]`)))].sort((a, b) => a.localeCompare(b))
  );
}

function freezeDeep<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) freezeDeep(child);
    Object.freeze(value);
  }
  return value as Readonly<T>;
}

function validateProjectedFact(
  fact: { observedAt: string; evidenceRefs: readonly string[] },
  asOfMs: number,
  label: string
): { observedAt: string; evidenceRefs: readonly string[] } {
  const observedAt = iso(fact.observedAt, `${label}.observedAt`);
  if (Date.parse(observedAt) > asOfMs) throw new Error(`${label}.observedAt cannot be after asOf`);
  return { observedAt, evidenceRefs: refs(fact.evidenceRefs, `${label}.evidenceRefs`) };
}

function decisionMakerForSide(
  opportunityId: string,
  person: OpportunityDecisionMakerV1,
  side: SponsorEcosystemSideV1,
  asOfMs: number,
  label: string
): SponsorEcosystemDecisionMakerV1 {
  const provenance = validateProjectedFact(person, asOfMs, label);
  return freezeDeep({
    opportunityId,
    side,
    personCanonicalId: requiredText(person.personCanonicalId, `${label}.personCanonicalId`),
    personLabel: requiredText(person.personLabel, `${label}.personLabel`),
    organizationCanonicalId: requiredText(person.organizationCanonicalId, `${label}.organizationCanonicalId`),
    organizationLabel: requiredText(person.organizationLabel, `${label}.organizationLabel`),
    decisionClass: requiredText(person.decisionClass, `${label}.decisionClass`),
    observedAt: provenance.observedAt,
    evidenceRefs: provenance.evidenceRefs
  });
}

function planningWindow(
  opportunityId: string,
  window: OpportunityPlanningWindowV1,
  asOfMs: number,
  label: string
): SponsorEcosystemPlanningWindowV1 {
  const provenance = validateProjectedFact(window, asOfMs, label);
  const windowStart = iso(window.windowStart, `${label}.windowStart`);
  const windowEnd = iso(window.windowEnd, `${label}.windowEnd`);
  if (Date.parse(windowEnd) < Date.parse(windowStart)) throw new Error(`${label}.windowEnd cannot precede windowStart`);
  return freezeDeep({
    opportunityId,
    windowType: requiredText(window.windowType, `${label}.windowType`),
    windowStart,
    windowEnd,
    whyThisWindow: requiredText(window.whyThisWindow, `${label}.whyThisWindow`),
    observedAt: provenance.observedAt,
    evidenceRefs: provenance.evidenceRefs
  });
}

function exactTargetedPath(
  opportunityId: string,
  path: OpportunityWarmAccessPathV1,
  decisionMakers: readonly SponsorEcosystemDecisionMakerV1[],
  asOfMs: number,
  label: string
): SponsorEcosystemWarmAccessPathV1 | null {
  const provenance = validateProjectedFact(path, asOfMs, label);
  if (!Array.isArray(path.path) || path.path.length < 2) throw new Error(`${label}.path must contain at least two nodes`);
  const normalizedPath = path.path.map((node, index) => {
    if (node.entityType !== "PERSON" && node.entityType !== "COMPANY") throw new Error(`${label}.path[${index}].entityType is unsupported`);
    return freezeDeep({
      entityType: node.entityType,
      canonicalId: requiredText(node.canonicalId, `${label}.path[${index}].canonicalId`),
      label: requiredText(node.label, `${label}.path[${index}].label`)
    });
  });
  const target = normalizedPath[normalizedPath.length - 1];
  if (target.entityType !== "PERSON") return null;
  const exactDecisionMaker = decisionMakers.find((person) => person.personCanonicalId === target.canonicalId);
  if (!exactDecisionMaker) return null;
  return freezeDeep({
    opportunityId,
    targetPersonCanonicalId: exactDecisionMaker.personCanonicalId,
    targetSide: exactDecisionMaker.side,
    path: normalizedPath,
    reasonForIntroduction: requiredText(path.reasonForIntroduction, `${label}.reasonForIntroduction`),
    observedAt: provenance.observedAt,
    evidenceRefs: provenance.evidenceRefs
  });
}

function linkKey(link: OpportunitySponsorshipLinkV1): string {
  return [link.propertyCanonicalId, link.sponsorCanonicalId, link.relationshipLabel].join("\u0000");
}

export function buildSponsorEcosystemMapV1(input: SponsorEcosystemMapInputV1): SponsorEcosystemMapResultV1 {
  if (!input || typeof input !== "object") throw new Error("input is required");
  if (!Array.isArray(input.accessMaps)) throw new Error("accessMaps must be an array");
  const asOf = iso(input.asOf, "asOf");
  const asOfMs = Date.parse(asOf);
  const seenOpportunityIds = new Set<string>();
  const opportunityPlanningWindows: SponsorEcosystemPlanningWindowV1[] = [];

  const groups = new Map<string, {
    propertyCanonicalId: string;
    propertyLabel: string;
    sponsorCanonicalId: string;
    sponsorLabel: string;
    relationshipLabel: string;
    links: Array<{ opportunityId: string; link: OpportunitySponsorshipLinkV1 }>;
  }>();

  input.accessMaps.forEach((map, mapIndex) => {
    if (!map || typeof map !== "object") throw new Error(`accessMaps[${mapIndex}] must be an object`);
    const opportunityId = requiredText(map.opportunityId, `accessMaps[${mapIndex}].opportunityId`);
    if (seenOpportunityIds.has(opportunityId)) throw new Error(`duplicate opportunity access map: ${opportunityId}`);
    seenOpportunityIds.add(opportunityId);
    const mapAsOf = iso(map.asOf, `accessMaps[${mapIndex}].asOf`);
    if (mapAsOf !== asOf) throw new Error(`accessMaps[${mapIndex}].asOf must exactly match asOf`);
    if (!Array.isArray(map.sponsorshipLinks) || !Array.isArray(map.decisionMakers) || !Array.isArray(map.warmAccessPaths) || !Array.isArray(map.planningWindows)) {
      throw new Error(`accessMaps[${mapIndex}] projected fact collections are invalid`);
    }
    if (map.sponsorshipLinks.length > 0 && map.coverage.SPONSORSHIP_LINK !== "EVIDENCED") {
      throw new Error(`accessMaps[${mapIndex}] sponsorship links are not fully evidenced`);
    }
    if (map.decisionMakers.length > 0 && map.coverage.DECISION_MAKER !== "EVIDENCED") {
      throw new Error(`accessMaps[${mapIndex}] decision makers are not fully evidenced`);
    }
    if (map.warmAccessPaths.length > 0 && map.coverage.WARM_ACCESS_PATH !== "EVIDENCED") {
      throw new Error(`accessMaps[${mapIndex}] warm access paths are not fully evidenced`);
    }
    if (map.planningWindows.length > 0 && map.coverage.PLANNING_WINDOW !== "EVIDENCED") {
      throw new Error(`accessMaps[${mapIndex}] planning windows are not fully evidenced`);
    }

    map.planningWindows.forEach((window, windowIndex) => {
      opportunityPlanningWindows.push(
        planningWindow(opportunityId, window, asOfMs, `accessMaps[${mapIndex}].planningWindows[${windowIndex}]`)
      );
    });

    map.sponsorshipLinks.forEach((link, linkIndex) => {
      const provenance = validateProjectedFact(link, asOfMs, `accessMaps[${mapIndex}].sponsorshipLinks[${linkIndex}]`);
      const propertyCanonicalId = requiredText(link.propertyCanonicalId, `accessMaps[${mapIndex}].sponsorshipLinks[${linkIndex}].propertyCanonicalId`);
      const sponsorCanonicalId = requiredText(link.sponsorCanonicalId, `accessMaps[${mapIndex}].sponsorshipLinks[${linkIndex}].sponsorCanonicalId`);
      if (propertyCanonicalId === sponsorCanonicalId) throw new Error(`accessMaps[${mapIndex}].sponsorshipLinks[${linkIndex}] cannot be a self-link`);
      const normalizedLink: OpportunitySponsorshipLinkV1 = {
        ...link,
        propertyCanonicalId,
        propertyLabel: requiredText(link.propertyLabel, `accessMaps[${mapIndex}].sponsorshipLinks[${linkIndex}].propertyLabel`),
        sponsorCanonicalId,
        sponsorLabel: requiredText(link.sponsorLabel, `accessMaps[${mapIndex}].sponsorshipLinks[${linkIndex}].sponsorLabel`),
        relationshipLabel: requiredText(link.relationshipLabel, `accessMaps[${mapIndex}].sponsorshipLinks[${linkIndex}].relationshipLabel`),
        observedAt: provenance.observedAt,
        evidenceRefs: provenance.evidenceRefs
      };
      const key = linkKey(normalizedLink);
      const group = groups.get(key) ?? {
        propertyCanonicalId,
        propertyLabel: normalizedLink.propertyLabel,
        sponsorCanonicalId,
        sponsorLabel: normalizedLink.sponsorLabel,
        relationshipLabel: normalizedLink.relationshipLabel,
        links: []
      };
      if (group.propertyLabel !== normalizedLink.propertyLabel || group.sponsorLabel !== normalizedLink.sponsorLabel) {
        throw new Error(`canonical sponsor link ${key} has conflicting labels`);
      }
      group.links.push({ opportunityId, link: normalizedLink });
      groups.set(key, group);
    });
  });

  const accessMapByOpportunity = new Map(input.accessMaps.map((map) => [map.opportunityId, map] as const));
  const ecosystems = [...groups.values()].map((group): SponsorEcosystemLinkV1 => {
    const opportunityIds = [...new Set(group.links.map((item) => item.opportunityId))].sort((a, b) => a.localeCompare(b));
    const evidenceRefs = [...new Set(group.links.flatMap((item) => item.link.evidenceRefs))].sort((a, b) => a.localeCompare(b));
    const observedAt = new Date(Math.max(...group.links.map((item) => Date.parse(item.link.observedAt)))).toISOString();
    const decisionMakers: SponsorEcosystemDecisionMakerV1[] = [];

    for (const opportunityId of opportunityIds) {
      const map = accessMapByOpportunity.get(opportunityId)!;
      map.decisionMakers.forEach((person, index) => {
        const organizationId = requiredText(person.organizationCanonicalId, `decisionMakers[${index}].organizationCanonicalId`);
        const side = organizationId === group.propertyCanonicalId
          ? "PROPERTY"
          : organizationId === group.sponsorCanonicalId
            ? "SPONSOR"
            : null;
        if (side) decisionMakers.push(decisionMakerForSide(opportunityId, person, side, asOfMs, `decisionMakers[${index}]`));
      });
    }

    const uniqueDecisionMakers = [...new Map(
      decisionMakers.map((person) => [[person.opportunityId, person.side, person.personCanonicalId, person.decisionClass].join("\u0000"), person] as const)
    ).values()].sort((a, b) => a.side.localeCompare(b.side) || a.personLabel.localeCompare(b.personLabel) || a.personCanonicalId.localeCompare(b.personCanonicalId));

    const warmAccessPaths: SponsorEcosystemWarmAccessPathV1[] = [];
    for (const opportunityId of opportunityIds) {
      const map = accessMapByOpportunity.get(opportunityId)!;
      map.warmAccessPaths.forEach((path, index) => {
        const projected = exactTargetedPath(
          opportunityId,
          path,
          uniqueDecisionMakers.filter((person) => person.opportunityId === opportunityId),
          asOfMs,
          `warmAccessPaths[${index}]`
        );
        if (projected) warmAccessPaths.push(projected);
      });
    }

    return freezeDeep({
      propertyCanonicalId: group.propertyCanonicalId,
      propertyLabel: group.propertyLabel,
      sponsorCanonicalId: group.sponsorCanonicalId,
      sponsorLabel: group.sponsorLabel,
      relationshipLabel: group.relationshipLabel,
      opportunityIds,
      observedAt,
      evidenceRefs,
      decisionMakers: uniqueDecisionMakers,
      warmAccessPaths: [...new Map(
        warmAccessPaths.map((path) => [[path.opportunityId, path.targetSide, path.targetPersonCanonicalId, path.path.map((node) => node.canonicalId).join(">")].join("\u0000"), path] as const)
      ).values()].sort((a, b) => a.targetSide.localeCompare(b.targetSide) || a.targetPersonCanonicalId.localeCompare(b.targetPersonCanonicalId))
    });
  }).sort((a, b) => a.propertyLabel.localeCompare(b.propertyLabel) || a.sponsorLabel.localeCompare(b.sponsorLabel) || a.relationshipLabel.localeCompare(b.relationshipLabel));

  const uniquePlanningWindows = [...new Map(
    opportunityPlanningWindows.map((window) => [[window.opportunityId, window.windowType, window.windowStart, window.windowEnd].join("\u0000"), window] as const)
  ).values()].sort((a, b) => a.opportunityId.localeCompare(b.opportunityId) || a.windowStart.localeCompare(b.windowStart) || a.windowEnd.localeCompare(b.windowEnd) || a.windowType.localeCompare(b.windowType));

  const result: SponsorEcosystemMapResultV1 = {
    version: SPONSOR_ECOSYSTEM_MAP_VERSION,
    asOf,
    ecosystems,
    opportunityPlanningWindows: uniquePlanningWindows,
    counts: {
      opportunitiesReviewed: seenOpportunityIds.size,
      sponsorLinks: ecosystems.length,
      propertyDecisionMakers: ecosystems.reduce((sum, ecosystem) => sum + ecosystem.decisionMakers.filter((person) => person.side === "PROPERTY").length, 0),
      sponsorDecisionMakers: ecosystems.reduce((sum, ecosystem) => sum + ecosystem.decisionMakers.filter((person) => person.side === "SPONSOR").length, 0),
      exactWarmAccessPaths: ecosystems.reduce((sum, ecosystem) => sum + ecosystem.warmAccessPaths.length, 0),
      explicitPlanningWindows: uniquePlanningWindows.length
    },
    inferredSponsorshipLinks: false,
    inferredDecisionAuthority: false,
    inferredWarmAccess: false,
    inferredContactInfo: false,
    inferredPlanningTiming: false,
    crmMutationPerformed: false,
    externalResearchPerformed: false,
    externalActionPerformed: false
  };
  return freezeDeep(result) as SponsorEcosystemMapResultV1;
}
