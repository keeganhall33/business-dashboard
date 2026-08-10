import type { ClaimQualifierV2 } from "@/lib/external-intelligence/contracts/claim-qualifiers-v2";
import { buildSupportExcerptsV1 } from "@/lib/external-intelligence/targeted-research/support-excerpts-v1";
import type { ProgramSurfacePredicateV1 } from "@/lib/external-intelligence/program-surfaces/program-surface-policy-v1";

export type NormalizeProgramSurfaceFromTextResultV1 =
  | {
      ok: true;
      candidates: Array<{
        predicate: ProgramSurfacePredicateV1;
        object_value: string;
        qualifiers: ClaimQualifierV2[];
        confidence: "high" | "medium" | "low";
        support_verdict: "clearly_supported" | "partially_supported" | "not_supported";
        support_rationale: string;
        support_excerpts: Array<{ text_hash: string; char_count: number }>;
      }>;
    }
  | { ok: false; error: string };

function lc(s: string) {
  return s.toLowerCase();
}

function hasAny(haystack: string, needles: string[]) {
  const h = lc(haystack);
  return needles.some((n) => h.includes(lc(n)));
}

function extractKeywordExcerpts(input: { text: string; keywords: string[]; locator_hint: string }): ReturnType<typeof buildSupportExcerptsV1> {
  // Very conservative: pick up to 3 short windows around the first matches.
  const t = input.text.replace(/\s+/g, " ");
  const excerpts: string[] = [];
  for (const kw of input.keywords) {
    const idx = lc(t).indexOf(lc(kw));
    if (idx === -1) continue;
    const start = Math.max(0, idx - 140);
    const end = Math.min(t.length, idx + 220);
    excerpts.push(t.slice(start, end));
    if (excerpts.length >= 3) break;
  }
  return buildSupportExcerptsV1({ locator_type: "text_excerpt", texts: excerpts, locator_hint: input.locator_hint });
}

function q(key: string, value: string): ClaimQualifierV2 {
  return { key, value_type: "string", value };
}

export function normalizeProgramSurfaceFromTextV1(input: {
  predicate: ProgramSurfacePredicateV1;
  text: string;
}): NormalizeProgramSurfaceFromTextResultV1 {
  const text = input.text.replace(/\s+/g, " ").trim();
  if (!text) return { ok: false, error: "empty_text" };

  // Deterministic negative patterns (event boundary / roster-only / attendee-only).
  const looksLikeSingleEvent =
    hasAny(text, ["hosted", "held", "took place", "on june", "on july", "on august", "on september", "on october", "on november", "on december"]) &&
    /\b(20\d{2}|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i.test(text);

  const partnerRosterOnly = hasAny(text, ["official partners", "our partners", "our sponsors"]) && !hasAny(text, ["activation", "integrat", "branded experience", "campaign"]);
  const vipAttendeeOnly = hasAny(text, ["vip guests attended", "vip guests were present", "vip attendees"]) && !hasAny(text, ["package", "hospitality", "membership"]);
  const oneOffFundraiser = hasAny(text, ["fundraiser", "fundraising campaign"]) && /\b(on|held on)\b/i.test(text) && /\b20\d{2}\b/.test(text);
  const oneOffAnniversary = hasAny(text, ["anniversary", "50th"]) && /\b20\d{2}\b/.test(text) && !hasAny(text, ["annual", "recurring", "each year"]);
  const hostedAtVenue = hasAny(text, ["hosted at", "held at", "took place at", "at the arena", "at the stadium"]);

  // Predicate-specific normalization.
  if (input.predicate === "runs_partner_activations") {
    if (partnerRosterOnly) {
      return {
        ok: true,
        candidates: [
          {
            predicate: input.predicate,
            object_value: "campaign_integration",
            qualifiers: [],
            confidence: "low",
            support_verdict: "not_supported",
            support_rationale: "partner roster alone does not evidence activation behavior",
            support_excerpts: []
          }
        ]
      };
    }

    const ex = extractKeywordExcerpts({
      text,
      keywords: ["activation", "campaign", "integration", "branded experience", "sponsor programming", "partner programming"],
      locator_hint: "partner_activations"
    });
    if (!ex.ok) return { ok: false, error: ex.error };

    const val = hasAny(text, ["branded experience"]) ? "branded_experience" : hasAny(text, ["integration"]) ? "campaign_integration" : hasAny(text, ["sponsor programming"]) ? "sponsor_programming" : "partner_programming";
    const conf: "high" | "medium" | "low" = hasAny(text, ["activation", "campaign", "integration", "branded experience"]) ? "high" : "medium";
    return {
      ok: true,
      candidates: [
        {
          predicate: input.predicate,
          object_value: val,
          qualifiers: [],
          confidence: conf,
          support_verdict: conf === "high" ? "clearly_supported" : "partially_supported",
          support_rationale: "explicit activation language",
          support_excerpts: ex.excerpts.map((e) => ({ text_hash: e.text_hash, char_count: e.char_count }))
        }
      ]
    };
  }

  if (input.predicate === "operates_event_program") {
    if (looksLikeSingleEvent) {
      return {
        ok: true,
        candidates: [
          {
            predicate: input.predicate,
            object_value: "event_series",
            qualifiers: [],
            confidence: "low",
            support_verdict: "not_supported",
            support_rationale: "single hosted event does not establish an ongoing program surface",
            support_excerpts: []
          }
        ]
      };
    }

    const ex = extractKeywordExcerpts({
      text,
      keywords: ["tour", "tournament series", "season", "calendar", "schedule", "circuit"],
      locator_hint: "event_program"
    });
    if (!ex.ok) return { ok: false, error: ex.error };

    let object_value: string = "event_series";
    if (hasAny(text, ["tour"])) object_value = "tour";
    else if (hasAny(text, ["tournament series"])) object_value = "tournament_series";
    else if (hasAny(text, ["experience", "fan experience"])) object_value = "experience_series";

    const qualifiers: ClaimQualifierV2[] = [];
    if (hasAny(text, ["annual", "every year"])) qualifiers.push(q("recurrence", "annual"));
    else if (hasAny(text, ["season", "throughout the year", "multiple events"])) qualifiers.push(q("recurrence", "periodic"));

    const conf: "high" | "medium" | "low" = hasAny(text, ["tour", "tournament series", "calendar", "schedule"]) ? "high" : "medium";
    return {
      ok: true,
      candidates: [
        {
          predicate: input.predicate,
          object_value,
          qualifiers,
          confidence: conf,
          support_verdict: conf === "high" ? "clearly_supported" : "partially_supported",
          support_rationale: "language indicates an ongoing structured program",
          support_excerpts: ex.excerpts.map((e) => ({ text_hash: e.text_hash, char_count: e.char_count }))
        }
      ]
    };
  }

  if (input.predicate === "offers_vip_hospitality") {
    if (vipAttendeeOnly) {
      return {
        ok: true,
        candidates: [
          {
            predicate: input.predicate,
            object_value: "vip_packages",
            qualifiers: [],
            confidence: "low",
            support_verdict: "not_supported",
            support_rationale: "VIP attendance alone is not an offering/program",
            support_excerpts: []
          }
        ]
      };
    }
    const ex = extractKeywordExcerpts({
      text,
      keywords: ["vip", "hospitality", "packages", "membership", "premium guest"],
      locator_hint: "vip_hospitality"
    });
    if (!ex.ok) return { ok: false, error: ex.error };

    const object_value = hasAny(text, ["membership"]) ? "membership_program" : hasAny(text, ["hospitality"]) ? "hospitality_packages" : hasAny(text, ["premium guest"]) ? "premium_guest_program" : "vip_packages";
    const conf: "high" | "medium" | "low" = hasAny(text, ["vip package", "hospitality package", "membership"]) ? "high" : "medium";
    return {
      ok: true,
      candidates: [
        {
          predicate: input.predicate,
          object_value,
          qualifiers: [],
          confidence: conf,
          support_verdict: conf === "high" ? "clearly_supported" : "partially_supported",
          support_rationale: "explicit offering language",
          support_excerpts: ex.excerpts.map((e) => ({ text_hash: e.text_hash, char_count: e.char_count }))
        }
      ]
    };
  }

  if (input.predicate === "runs_philanthropy_program") {
    if (oneOffFundraiser) {
      return {
        ok: true,
        candidates: [
          {
            predicate: input.predicate,
            object_value: "fundraising_program",
            qualifiers: [],
            confidence: "low",
            support_verdict: "not_supported",
            support_rationale: "single dated fundraiser does not establish a standing program",
            support_excerpts: []
          }
        ]
      };
    }
    const ex = extractKeywordExcerpts({
      text,
      keywords: ["foundation", "charity program", "social impact", "fundraising program"],
      locator_hint: "philanthropy"
    });
    if (!ex.ok) return { ok: false, error: ex.error };
    const object_value = hasAny(text, ["foundation"]) ? "foundation" : hasAny(text, ["social impact"]) ? "social_impact_program" : hasAny(text, ["charity"]) ? "charity_program" : "fundraising_program";
    const conf: "high" | "medium" | "low" = hasAny(text, ["foundation", "social impact", "charity program"]) ? "high" : "medium";
    return {
      ok: true,
      candidates: [
        {
          predicate: input.predicate,
          object_value,
          qualifiers: [],
          confidence: conf,
          support_verdict: conf === "high" ? "clearly_supported" : "partially_supported",
          support_rationale: "standing philanthropy surface language",
          support_excerpts: ex.excerpts.map((e) => ({ text_hash: e.text_hash, char_count: e.char_count }))
        }
      ]
    };
  }

  if (input.predicate === "operates_physical_environment") {
    if (hostedAtVenue) {
      return {
        ok: true,
        candidates: [
          {
            predicate: input.predicate,
            object_value: "event_venue",
            qualifiers: [],
            confidence: "low",
            support_verdict: "not_supported",
            support_rationale: "hosting/holding an event at a venue does not imply operating it",
            support_excerpts: []
          }
        ]
      };
    }
    const ex = extractKeywordExcerpts({
      text,
      keywords: ["owned", "operated", "hotel", "resort", "headquarters", "office", "venue"],
      locator_hint: "physical_environment"
    });
    if (!ex.ok) return { ok: false, error: ex.error };
    const qualifiers: ClaimQualifierV2[] = [];
    if (hasAny(text, ["owned", "own"])) qualifiers.push(q("operation_relation", "owned"));
    else if (hasAny(text, ["operated", "operate"])) qualifiers.push(q("operation_relation", "operated"));

    let object_value: string = "institutional_space";
    if (hasAny(text, ["hotel"])) object_value = "hotel";
    else if (hasAny(text, ["resort"])) object_value = "resort";
    else if (hasAny(text, ["headquarters"])) object_value = "headquarters";
    else if (hasAny(text, ["office"])) object_value = "corporate_office";
    else if (hasAny(text, ["stadium"])) object_value = "sports_venue";
    else if (hasAny(text, ["arena", "venue"])) object_value = "event_venue";

    const conf: "high" | "medium" | "low" = qualifiers.length ? "high" : "medium";
    return {
      ok: true,
      candidates: [
        {
          predicate: input.predicate,
          object_value,
          qualifiers,
          confidence: conf,
          support_verdict: conf === "high" ? "clearly_supported" : "partially_supported",
          support_rationale: "operational control language (owned/operated) required for high confidence",
          support_excerpts: ex.excerpts.map((e) => ({ text_hash: e.text_hash, char_count: e.char_count }))
        }
      ]
    };
  }

  if (input.predicate === "runs_commemoration_program") {
    if (oneOffAnniversary) {
      return {
        ok: true,
        candidates: [
          {
            predicate: input.predicate,
            object_value: "recognition_program",
            qualifiers: [],
            confidence: "low",
            support_verdict: "not_supported",
            support_rationale: "one-time anniversary is an Event, not a recurring commemoration program",
            support_excerpts: []
          }
        ]
      };
    }
    const ex = extractKeywordExcerpts({
      text,
      keywords: ["annual", "every year", "induction", "awards", "recognition", "legacy"],
      locator_hint: "commemoration_program"
    });
    if (!ex.ok) return { ok: false, error: ex.error };
    const qualifiers: ClaimQualifierV2[] = [];
    if (hasAny(text, ["annual", "every year", "each year"])) qualifiers.push(q("recurrence", "annual"));
    else if (hasAny(text, ["periodic", "each season"])) qualifiers.push(q("recurrence", "periodic"));

    const object_value = hasAny(text, ["induction"]) ? "induction_program" : hasAny(text, ["awards"]) ? "awards_program" : hasAny(text, ["legacy"]) ? "legacy_program" : "recognition_program";

    const conf: "high" | "medium" | "low" = qualifiers.length ? "high" : "medium";
    return {
      ok: true,
      candidates: [
        {
          predicate: input.predicate,
          object_value,
          qualifiers,
          confidence: conf,
          support_verdict: conf === "high" ? "clearly_supported" : "partially_supported",
          support_rationale: "recurrence required for program surface",
          support_excerpts: ex.excerpts.map((e) => ({ text_hash: e.text_hash, char_count: e.char_count }))
        }
      ]
    };
  }

  if (input.predicate === "operates_merchandising") {
    const ex = extractKeywordExcerpts({ text, keywords: ["shop", "store", "collectibles", "merchandise"], locator_hint: "merchandising" });
    if (!ex.ok) return { ok: false, error: ex.error };
    const object_value = hasAny(text, ["collectible"]) ? "collectibles" : hasAny(text, ["merchandise"]) ? "merchandise_line" : "official_shop";
    const conf: "high" | "medium" | "low" = hasAny(text, ["shop", "store"]) ? "high" : "medium";
    return {
      ok: true,
      candidates: [
        {
          predicate: input.predicate,
          object_value,
          qualifiers: [],
          confidence: conf,
          support_verdict: conf === "high" ? "clearly_supported" : "partially_supported",
          support_rationale: "explicit merchandising surface language",
          support_excerpts: ex.excerpts.map((e) => ({ text_hash: e.text_hash, char_count: e.char_count }))
        }
      ]
    };
  }

  if (input.predicate === "operates_licensing") {
    const ex = extractKeywordExcerpts({ text, keywords: ["licensing", "license", "ip licensing", "brand licensing"], locator_hint: "licensing" });
    if (!ex.ok) return { ok: false, error: ex.error };
    const object_value = hasAny(text, ["content", "media licensing"]) ? "content_media_licensing" : hasAny(text, ["product licensing"]) ? "product_licensing" : "brand_ip_licensing";
    const conf: "high" | "medium" | "low" = hasAny(text, ["licensing", "license"]) ? "high" : "medium";
    return {
      ok: true,
      candidates: [
        {
          predicate: input.predicate,
          object_value,
          qualifiers: [],
          confidence: conf,
          support_verdict: conf === "high" ? "clearly_supported" : "partially_supported",
          support_rationale: "explicit licensing surface language",
          support_excerpts: ex.excerpts.map((e) => ({ text_hash: e.text_hash, char_count: e.char_count }))
        }
      ]
    };
  }

  if (input.predicate === "operates_retail_distribution") {
    const ex = extractKeywordExcerpts({
      text,
      keywords: ["wholesale", "marketplace", "distribution", "where to buy", "retail channels"],
      locator_hint: "retail_distribution"
    });
    if (!ex.ok) return { ok: false, error: ex.error };
    const object_value = hasAny(text, ["wholesale"]) ? "wholesale" : hasAny(text, ["marketplace"]) ? "marketplace" : hasAny(text, ["distribution partnership"]) ? "distribution_partnerships" : "retail_channels";
    const conf: "high" | "medium" | "low" = hasAny(text, ["wholesale", "marketplace", "distribution", "where to buy"]) ? "high" : "medium";
    return {
      ok: true,
      candidates: [
        {
          predicate: input.predicate,
          object_value,
          qualifiers: [],
          confidence: conf,
          support_verdict: conf === "high" ? "clearly_supported" : "partially_supported",
          support_rationale: "explicit distribution/channel language",
          support_excerpts: ex.excerpts.map((e) => ({ text_hash: e.text_hash, char_count: e.char_count }))
        }
      ]
    };
  }

  if (input.predicate === "runs_art_culture_design_program") {
    const ex = extractKeywordExcerpts({
      text,
      keywords: ["commission", "exhibition", "cultural partnership", "design initiative", "artist collaboration"],
      locator_hint: "art_culture_design"
    });
    if (!ex.ok) return { ok: false, error: ex.error };
    const object_value = hasAny(text, ["exhibition"]) ? "exhibitions" : hasAny(text, ["cultural partnership"]) ? "cultural_partnerships" : hasAny(text, ["design"]) ? "design_initiatives" : hasAny(text, ["collaboration", "artist collab"]) ? "artist_collabs" : "art_commissions";
    const conf: "high" | "medium" | "low" = hasAny(text, ["commission", "exhibition", "cultural partnership", "design initiative", "artist collaboration"]) ? "high" : "medium";
    return {
      ok: true,
      candidates: [
        {
          predicate: input.predicate,
          object_value,
          qualifiers: [],
          confidence: conf,
          support_verdict: conf === "high" ? "clearly_supported" : "partially_supported",
          support_rationale: "explicit program language",
          support_excerpts: ex.excerpts.map((e) => ({ text_hash: e.text_hash, char_count: e.char_count }))
        }
      ]
    };
  }

  if (input.predicate === "runs_relationship_recognition") {
    const ex = extractKeywordExcerpts({
      text,
      keywords: ["gifting", "recognition", "donor", "member", "award", "executive"],
      locator_hint: "relationship_recognition"
    });
    // Allow empty excerpts to mean not supported.
    if (!ex.ok) {
      return {
        ok: true,
        candidates: [
          {
            predicate: input.predicate,
            object_value: "client_gifting",
            qualifiers: [],
            confidence: "low",
            support_verdict: "not_supported",
            support_rationale: "no explicit recognition/gifting mechanism evidenced",
            support_excerpts: []
          }
        ]
      };
    }

    const object_value = hasAny(text, ["donor", "member recognition"]) ? "donor_member_recognition" : hasAny(text, ["executive"]) ? "executive_recognition" : hasAny(text, ["partner recognition"]) ? "partner_recognition" : hasAny(text, ["talent gifting"]) ? "talent_gifting" : hasAny(text, ["commemorative"]) ? "commemorative_gifting" : hasAny(text, ["award"]) ? "award_recognition" : "client_gifting";
    const conf: "high" | "medium" | "low" = hasAny(text, ["gifting", "recognition", "award program"]) ? "high" : "medium";
    return {
      ok: true,
      candidates: [
        {
          predicate: input.predicate,
          object_value,
          qualifiers: [],
          confidence: conf,
          support_verdict: conf === "high" ? "clearly_supported" : "partially_supported",
          support_rationale: "explicit recognition/gifting language",
          support_excerpts: ex.excerpts.map((e) => ({ text_hash: e.text_hash, char_count: e.char_count }))
        }
      ]
    };
  }

  return { ok: false, error: "unsupported_predicate" };
}
