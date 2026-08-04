import type { FusionCandidate } from "@/lib/fusion-v1/contracts";

export type DedupeDecision = {
  cluster_id: string;
  member_candidate_ids: string[];
  reason_codes: string[];
};

export type ClusteredCandidate = {
  cluster_id: string;
  merged: FusionCandidate;
  members: FusionCandidate[];
  dedupe_decision: DedupeDecision;
};

function uniqStrings(items: string[]): string[] {
  return Array.from(new Set(items));
}

function uniqObjects<T extends Record<string, unknown>>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const key = JSON.stringify(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export function dedupeAndCluster(input: {
  candidates: FusionCandidate[];
  candidateFingerprintById: Record<string, string>;
}): {
  clustered: ClusteredCandidate[];
  dedupe_decisions: DedupeDecision[];
} {
  const remaining = [...input.candidates];
  const clusters: ClusteredCandidate[] = [];
  const decisions: DedupeDecision[] = [];
  let clusterN = 0;

  const popFirst = () => remaining.shift()!;

  while (remaining.length) {
    const seed = popFirst();
    const members: FusionCandidate[] = [seed];
    const reason_codes: string[] = [];

    const seedFingerprint = seed.recommendation_fingerprint ?? input.candidateFingerprintById[seed.candidate_id] ?? null;
    if (seed.recommendation_fingerprint) reason_codes.push("seed:recommendation_fingerprint");
    else reason_codes.push("seed:candidate_fingerprint");

    // Find other candidates that should cluster with seed.
    for (let i = remaining.length - 1; i >= 0; i--) {
      const c = remaining[i]!;

      const cFingerprint = c.recommendation_fingerprint ?? input.candidateFingerprintById[c.candidate_id] ?? null;
      const sameFingerprint = seedFingerprint && cFingerprint && seedFingerprint === cFingerprint;

      const sameFinding = Boolean(seed.linked_finding_id && c.linked_finding_id && seed.linked_finding_id === c.linked_finding_id);
      const sameActionKey = Boolean(
        seed.proposed_action?.action_key && c.proposed_action?.action_key && seed.proposed_action.action_key === c.proposed_action.action_key
      );

      const sharedFacts = seed.supporting_evidence_fact_ids.filter((f) => c.supporting_evidence_fact_ids.includes(f));
      const twoSharedFacts = sharedFacts.length >= 2;

      const sameDomains = seed.affected_business_domains.some((d) => c.affected_business_domains.includes(d));
      const overlappingMechanism = Boolean(seed.expected_mechanism && c.expected_mechanism && seed.expected_mechanism === c.expected_mechanism);
      const sameWindow = Boolean(seed.linked_finding_id && seed.linked_finding_id === c.linked_finding_id);
      const domainWindowMechanism = sameDomains && (sameWindow || overlappingMechanism);

      if (sameFingerprint || sameFinding || sameActionKey || twoSharedFacts || domainWindowMechanism) {
        if (sameFingerprint) reason_codes.push("cluster:same_fingerprint");
        if (sameFinding) reason_codes.push("cluster:same_finding");
        if (sameActionKey) reason_codes.push("cluster:same_action_key");
        if (twoSharedFacts) reason_codes.push("cluster:shared_supporting_facts");
        if (domainWindowMechanism) reason_codes.push("cluster:domain_window_mechanism_overlap");
        members.push(c);
        remaining.splice(i, 1);
      }
    }

    clusterN += 1;
    const cluster_id = `cluster_${clusterN}`;

    const merged: FusionCandidate = {
      ...seed,
      candidate_id: cluster_id,

      // Preserve linkage: if any member has a real id, keep the seed's unless missing.
      linked_finding_id: seed.linked_finding_id ?? members.find((m) => m.linked_finding_id)?.linked_finding_id ?? null,
      linked_hypothesis_ids: uniqStrings(members.flatMap((m) => m.linked_hypothesis_ids)),
      linked_opportunity_id: seed.linked_opportunity_id ?? members.find((m) => m.linked_opportunity_id)?.linked_opportunity_id ?? null,
      linked_recommendation_id:
        seed.linked_recommendation_id ?? members.find((m) => m.linked_recommendation_id)?.linked_recommendation_id ?? null,

      recommendation_fingerprint:
        seed.recommendation_fingerprint ?? members.find((m) => m.recommendation_fingerprint)?.recommendation_fingerprint ?? null,

      affected_business_domains: uniqStrings(members.flatMap((m) => m.affected_business_domains)) as FusionCandidate["affected_business_domains"],
      affected_entities: uniqObjects(members.flatMap((m) => m.affected_entities)) as FusionCandidate["affected_entities"],

      supporting_evidence_fact_ids: uniqStrings(members.flatMap((m) => m.supporting_evidence_fact_ids)),
      contradicting_evidence_fact_ids: uniqStrings(members.flatMap((m) => m.contradicting_evidence_fact_ids)),
      missing_evidence: uniqStrings(members.flatMap((m) => m.missing_evidence)),

      internal_sources_used: uniqStrings(members.flatMap((m) => m.internal_sources_used)),
      external_signals_used: uniqStrings(members.flatMap((m) => m.external_signals_used)),
      external_signals_missing: uniqStrings(members.flatMap((m) => m.external_signals_missing)),

      blocked_domain_constraints: uniqStrings(members.flatMap((m) => m.blocked_domain_constraints)) as FusionCandidate["blocked_domain_constraints"],
      strategic_guardrail_violations: uniqStrings(
        members.flatMap((m) => m.strategic_guardrail_violations)
      ) as FusionCandidate["strategic_guardrail_violations"],

      // Proposed action selection rule: prefer information-gain when any member is low confidence/high missing.
      proposed_action:
        seed.proposed_action ??
        members.find((m) => m.proposed_action)?.proposed_action ??
        null,

      evidence_edges: uniqObjects(
        members.flatMap((m) => m.evidence_edges as unknown as Array<Record<string, unknown>>)
      ) as unknown as FusionCandidate["evidence_edges"],

      thesis_influence_trace: [],
      knowledge_gap_ids: uniqStrings(members.flatMap((m) => m.knowledge_gap_ids)),
      scenario_ids_evaluated: uniqStrings(members.flatMap((m) => m.scenario_ids_evaluated)),
      resilience_score: null,
      fragile_assumptions: uniqStrings(members.flatMap((m) => m.fragile_assumptions)),
      contingency_id: null,
      early_warning_indicators: uniqStrings(members.flatMap((m) => m.early_warning_indicators))
    };

    const dedupe_decision: DedupeDecision = {
      cluster_id,
      member_candidate_ids: members.map((m) => m.candidate_id).sort(),
      reason_codes: uniqStrings(reason_codes).sort()
    };

    decisions.push(dedupe_decision);
    clusters.push({ cluster_id, merged, members, dedupe_decision });
  }

  return { clustered: clusters, dedupe_decisions: decisions };
}
