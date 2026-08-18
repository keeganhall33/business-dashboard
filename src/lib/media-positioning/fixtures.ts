import {
  MEDIA_POSITIONING_CONTRACT_VERSION_V1,
  type ContentBriefV1,
  type MediaAssetRecordV1,
  type MediaPositioningFixtureBundleV1,
  type MediaPositioningOpportunityV1,
  type MediaProofPointV1
} from "./contracts";

const GENERATED_AT = "2026-08-18T00:00:00.000Z";

function provenance(source_id: string, source_label: string, notes: string): MediaProofPointV1["provenance"][number] {
  return {
    source_id,
    source_label,
    evidence_type: "FIXTURE_BASELINE",
    observed_at: "2026-08-18",
    notes
  };
}

export const MEDIA_PROOF_POINT_FIXTURES_V1: MediaProofPointV1[] = [
  {
    contract_version: MEDIA_POSITIONING_CONTRACT_VERSION_V1,
    proof_point_id: "proof-jordan-cultural-sports-icon",
    label: "Michael Jordan cultural sports icon proof",
    category: "ELITE_ATHLETE",
    people_or_entities: ["Michael Jordan", "Jordan"],
    project_or_moment: "Jordan-related artwork and archive proof",
    narrative_use: "Use as part of a broader greatness-and-craftsmanship arc, not as a standalone name-drop.",
    prestige_signal: "HIGH",
    endorsement_status: "DEPICTION_ONLY",
    endorsement_safeguard: "Do not state or imply Michael Jordan endorsed Keegan unless a separate verified endorsement proof point exists.",
    provenance: [provenance("issue-427-jordan-fixture", "Issue #427 proof baseline", "Fixture encodes a known cultural proof point without endorsement claims.")],
    relationship_strategy_refs: ["career-os-cultural-power-map", "crm-316-relationship-proof-compatible"]
  },
  {
    contract_version: MEDIA_POSITIONING_CONTRACT_VERSION_V1,
    proof_point_id: "proof-rory-elite-athlete",
    label: "Rory elite athlete proof",
    category: "ELITE_ATHLETE",
    people_or_entities: ["Rory McIlroy", "Rory"],
    project_or_moment: "Rory-related artwork / golf culture moment",
    narrative_use: "Connect precision, pressure, and elite performance across golf and graphite craft.",
    prestige_signal: "HIGH",
    endorsement_status: "OWNERSHIP_OR_RECEIPT_ONLY",
    endorsement_safeguard: "Ownership, receipt, or subject relationship is not an endorsement unless explicitly documented.",
    provenance: [provenance("issue-427-rory-fixture", "Issue #427 proof baseline", "Fixture keeps athlete association separate from endorsement.")],
    relationship_strategy_refs: ["career-os-room-access-playbook", "crm-316-relationship-proof-compatible"]
  },
  {
    contract_version: MEDIA_POSITIONING_CONTRACT_VERSION_V1,
    proof_point_id: "proof-obama-presidential-center",
    label: "Obama / Presidential Center institutional association",
    category: "INSTITUTIONAL",
    people_or_entities: ["Barack Obama", "Obama Presidential Center"],
    project_or_moment: "Obama / Presidential Center proof point",
    narrative_use: "Position the work near institutional memory, legacy, and civic-cultural significance.",
    prestige_signal: "HIGH",
    endorsement_status: "INSTITUTIONAL_ASSOCIATION",
    endorsement_safeguard: "Describe only the verified institutional association; do not imply personal or institutional endorsement beyond the evidence.",
    provenance: [provenance("issue-427-obama-presidential-center-fixture", "Issue #427 proof baseline", "Institutional proof point fixture; exact public wording requires rights/provenance review.")],
    relationship_strategy_refs: ["career-os-institution-phase", "crm-316-relationship-proof-compatible"]
  },
  {
    contract_version: MEDIA_POSITIONING_CONTRACT_VERSION_V1,
    proof_point_id: "proof-augusta-golf-institution",
    label: "Augusta golf institution proof",
    category: "PLACE_MOMENT",
    people_or_entities: ["Augusta", "Golf culture"],
    project_or_moment: "Augusta-related artwork / moment",
    narrative_use: "Use as a place-and-ritual proof point for prestige sports culture and restraint.",
    prestige_signal: "HIGH",
    endorsement_status: "DEPICTION_ONLY",
    endorsement_safeguard: "Do not imply Augusta National, the Masters, or related institutions endorsed the work without verified permission.",
    provenance: [provenance("issue-427-augusta-fixture", "Issue #427 proof baseline", "Prestige place fixture requiring careful rights wording.")],
    relationship_strategy_refs: ["career-os-cultural-calendar", "noah-event-access-intelligence"]
  },
  {
    contract_version: MEDIA_POSITIONING_CONTRACT_VERSION_V1,
    proof_point_id: "proof-music-figures-cultural-span",
    label: "Music figures cultural span proof",
    category: "MUSIC_CULTURE",
    people_or_entities: ["Music figures"],
    project_or_moment: "Music-related artwork and relationship archive",
    narrative_use: "Show that the studio's cultural surface spans sports and music without turning every name into a claim.",
    prestige_signal: "MEDIUM",
    endorsement_status: "UNKNOWN",
    endorsement_safeguard: "Do not imply endorsement; use category-level narrative until each person, relationship, and rights status is individually verified.",
    provenance: [provenance("issue-427-music-fixture", "Issue #427 proof baseline", "Known proof family, intentionally not enumerated into endorsement claims.")],
    relationship_strategy_refs: ["career-os-cultural-power-map", "lyra-owned-future-cultural-proof"]
  },
  {
    contract_version: MEDIA_POSITIONING_CONTRACT_VERSION_V1,
    proof_point_id: "proof-major-athletes-cumulative",
    label: "Major athletes cumulative proof",
    category: "ELITE_ATHLETE",
    people_or_entities: ["Major athletes"],
    project_or_moment: "Multi-athlete archive across defining achievements",
    narrative_use: "Build cumulative authority around elite performance and defining achievement rather than isolated portraits.",
    prestige_signal: "HIGH",
    endorsement_status: "UNKNOWN",
    endorsement_safeguard: "Do not imply endorsement; only name individuals when the archive record confirms relationship, rights, and allowed phrasing.",
    provenance: [provenance("issue-427-major-athletes-fixture", "Issue #427 proof baseline", "Cumulative athlete proof family for archive-first mining.")],
    relationship_strategy_refs: ["career-os-cultural-power-map", "crm-316-relationship-proof-compatible"]
  },
  {
    contract_version: MEDIA_POSITIONING_CONTRACT_VERSION_V1,
    proof_point_id: "proof-charity-impact",
    label: "Charity impact proof",
    category: "CHARITY_IMPACT",
    people_or_entities: ["Charity partners", "Community impact"],
    project_or_moment: "Artwork used to support charitable impact",
    narrative_use: "Use sparingly as proof that craft can create real-world value without becoming charity-first positioning.",
    prestige_signal: "MEDIUM",
    endorsement_status: "MEDIA_COVERAGE_ONLY",
    endorsement_safeguard: "Do not overstate impact amount, beneficiary relationship, or partner endorsement without direct evidence.",
    provenance: [provenance("issue-427-charity-impact-fixture", "Issue #427 proof baseline", "Impact proof point requiring exact outcome verification before public use.")],
    relationship_strategy_refs: ["career-os-career-capital", "crm-316-relationship-proof-compatible"]
  },
  {
    contract_version: MEDIA_POSITIONING_CONTRACT_VERSION_V1,
    proof_point_id: "proof-major-media-appearances",
    label: "Major media appearances proof",
    category: "MAJOR_MEDIA",
    people_or_entities: ["Major media appearances"],
    project_or_moment: "Press and broadcast archive",
    narrative_use: "Use as third-party attention proof after the story leads with the work and cultural thesis.",
    prestige_signal: "HIGH",
    endorsement_status: "MEDIA_COVERAGE_ONLY",
    endorsement_safeguard: "Do not imply endorsement; media coverage proves coverage, not sales demand or institutional validation.",
    provenance: [provenance("issue-427-major-media-fixture", "Issue #427 proof baseline", "Media appearance family for future archive indexing.")],
    relationship_strategy_refs: ["lyra-media-narrative", "noah-cultural-opportunity-radar"]
  }
];

export const MEDIA_ASSET_FIXTURES_V1: MediaAssetRecordV1[] = [
  {
    contract_version: MEDIA_POSITIONING_CONTRACT_VERSION_V1,
    asset_id: "asset-jordan-process-and-final",
    proof_point_refs: ["proof-jordan-cultural-sports-icon"],
    kind: "VIDEO",
    title: "Jordan process and final reveal archive",
    people_or_entities: ["Michael Jordan", "Jordan"],
    project_or_moment: "Jordan-related artwork",
    location: "studio archive",
    captured_at: null,
    quality: "STRONG",
    rights_status: "REVIEW_REQUIRED",
    rights_notes: "Usable for internal brief planning; public use requires likeness/platform rights review and exact wording.",
    narrative_tags: ["greatness", "elite performance", "craft proof", "archive repurpose"],
    reusable_excerpt_notes: ["macro graphite detail", "slow reveal", "hands/process sequence"],
    archive_status: "INDEXED_FIXTURE",
    provenance: [provenance("asset-fixture-jordan", "Fixture archive record", "Represents existing archive material to be verified by future media connectors.")]
  },
  {
    contract_version: MEDIA_POSITIONING_CONTRACT_VERSION_V1,
    asset_id: "asset-rory-golf-story",
    proof_point_refs: ["proof-rory-elite-athlete", "proof-augusta-golf-institution"],
    kind: "PHOTO",
    title: "Rory / golf culture proof asset group",
    people_or_entities: ["Rory McIlroy", "Augusta"],
    project_or_moment: "Golf culture artwork proof",
    location: "studio archive",
    captured_at: null,
    quality: "USABLE",
    rights_status: "REVIEW_REQUIRED",
    rights_notes: "Public post needs subject, event, and institutional phrasing review.",
    narrative_tags: ["golf", "pressure", "restraint", "elite rooms"],
    reusable_excerpt_notes: ["final artwork crop", "detail crop", "caption-led narrative"],
    archive_status: "INDEXED_FIXTURE",
    provenance: [provenance("asset-fixture-rory-augusta", "Fixture archive record", "Grouped asset for golf proof scenario planning.")]
  },
  {
    contract_version: MEDIA_POSITIONING_CONTRACT_VERSION_V1,
    asset_id: "asset-obama-presidential-center-doc",
    proof_point_refs: ["proof-obama-presidential-center"],
    kind: "DOCUMENT",
    title: "Obama / Presidential Center provenance packet",
    people_or_entities: ["Barack Obama", "Obama Presidential Center"],
    project_or_moment: "Institutional association proof",
    location: null,
    captured_at: null,
    quality: "HERO",
    rights_status: "REVIEW_REQUIRED",
    rights_notes: "Institutional association wording must be confirmed before public use.",
    narrative_tags: ["legacy", "institutional memory", "civic culture", "authority"],
    reusable_excerpt_notes: ["proof card", "caption source note", "press-kit language"],
    archive_status: "INDEXED_FIXTURE",
    provenance: [provenance("asset-fixture-obama-doc", "Fixture archive record", "Documentation placeholder for future CRM/file connector verification.")]
  },
  {
    contract_version: MEDIA_POSITIONING_CONTRACT_VERSION_V1,
    asset_id: "asset-major-media-clips",
    proof_point_refs: ["proof-major-media-appearances"],
    kind: "PRESS_CLIP",
    title: "Major media appearance clip archive",
    people_or_entities: ["Major media appearances"],
    project_or_moment: "Press and broadcast proof",
    location: null,
    captured_at: null,
    quality: "STRONG",
    rights_status: "UNKNOWN",
    rights_notes: "Clip reuse rights and excerpt length must be reviewed before publication.",
    narrative_tags: ["third-party attention", "media proof", "archive mining"],
    reusable_excerpt_notes: ["short quoted clip if rights allow", "still frame if rights allow", "private proof for relationship context"],
    archive_status: "NEEDS_INDEXING",
    provenance: [provenance("asset-fixture-media", "Fixture archive record", "Known media family; exact clips need indexing.")]
  },
  {
    contract_version: MEDIA_POSITIONING_CONTRACT_VERSION_V1,
    asset_id: "asset-music-figures-missing-index",
    proof_point_refs: ["proof-music-figures-cultural-span"],
    kind: "VIDEO",
    title: "Music figures archive requiring indexing",
    people_or_entities: ["Music figures"],
    project_or_moment: "Music culture proof family",
    location: null,
    captured_at: null,
    quality: "UNKNOWN",
    rights_status: "UNKNOWN",
    rights_notes: "Needs person-by-person rights and relationship verification before naming anyone.",
    narrative_tags: ["music", "cross-cultural authority", "needs transcript mining"],
    reusable_excerpt_notes: [],
    archive_status: "NEEDS_INDEXING",
    provenance: [provenance("asset-fixture-music", "Fixture archive record", "Placeholder for future file/media connector indexing.")]
  }
];

export const MEDIA_OPPORTUNITY_FIXTURES_V1: MediaPositioningOpportunityV1[] = [
  {
    contract_version: MEDIA_POSITIONING_CONTRACT_VERSION_V1,
    opportunity_id: "opp-greatness-recognizes-greatness",
    why_now: "Keegan needs a premium narrative bridge from isolated process clips toward cumulative cultural authority.",
    narrative: "Greatness Recognizes Greatness: the studio has repeatedly orbited people, places, and moments associated with defining achievement.",
    proof_point_refs: ["proof-jordan-cultural-sports-icon", "proof-rory-elite-athlete", "proof-major-athletes-cumulative"],
    positioning_objective: "Reframe the archive as cultural authority while keeping craftsmanship as the proof mechanism.",
    cultural_window: null,
    relationship_strategy_refs: ["career-os-cultural-power-map", "lyra-media-narrative"],
    expected_positioning_value: "HIGH",
    risk_notes: ["Avoid repetitive name-dropping.", "No athlete endorsement claims without direct proof."]
  },
  {
    contract_version: MEDIA_POSITIONING_CONTRACT_VERSION_V1,
    opportunity_id: "opp-institutional-legacy-proof",
    why_now: "Institutional proof can raise the ceiling above local artist framing if the language stays evidence-honest.",
    narrative: "From graphite detail to legacy: use the Obama / Presidential Center proof point to show that the work can sit near institutional memory.",
    proof_point_refs: ["proof-obama-presidential-center", "proof-major-media-appearances"],
    positioning_objective: "Move the public frame toward institutional seriousness and long-term cultural record.",
    cultural_window: null,
    relationship_strategy_refs: ["career-os-institution-phase", "noah-cultural-opportunity-radar"],
    expected_positioning_value: "HIGH",
    risk_notes: ["Requires exact provenance and rights wording.", "Do not imply a personal presidential endorsement."]
  },
  {
    contract_version: MEDIA_POSITIONING_CONTRACT_VERSION_V1,
    opportunity_id: "opp-archive-mining-music-athletes",
    why_now: "The archive likely contains underused proof across music and sport, but rights and identity verification are incomplete.",
    narrative: "Before posting, mine the archive for the strongest cross-cultural pattern and verify who can be named.",
    proof_point_refs: ["proof-music-figures-cultural-span", "proof-major-athletes-cumulative", "proof-major-media-appearances"],
    positioning_objective: "Create a rights-safe story map that can feed premium briefs without weak public claims.",
    cultural_window: null,
    relationship_strategy_refs: ["crm-316-relationship-proof-compatible", "future-file-media-connectors"],
    expected_positioning_value: "MEDIUM",
    risk_notes: ["Unknown rights and identity status.", "Publishing before indexing risks false implication."]
  },
  {
    contract_version: MEDIA_POSITIONING_CONTRACT_VERSION_V1,
    opportunity_id: "opp-next-elite-room-event-capture",
    why_now: "Future cultural rooms should generate relationship proof, not just attendance footage.",
    narrative: "Design event capture around access, context, and encounter proof before the moment happens.",
    proof_point_refs: ["proof-augusta-golf-institution", "proof-charity-impact"],
    positioning_objective: "Build reusable premium assets from future rooms while protecting relationship trust.",
    cultural_window: "next qualified elite room or charity/culture event",
    relationship_strategy_refs: ["career-os-room-access-playbook", "noah-event-access-intelligence"],
    expected_positioning_value: "MEDIUM",
    risk_notes: ["Requires human shooter/editor when the room quality matters.", "Do not capture private relationship moments without permission."]
  }
];

export const MEDIA_BRIEF_FIXTURES_V1: ContentBriefV1[] = [
  {
    contract_version: MEDIA_POSITIONING_CONTRACT_VERSION_V1,
    brief_id: "brief-greatness-recognizes-greatness-archive",
    opportunity_ref: "opp-greatness-recognizes-greatness",
    recommendation: "NEW_VOICEOVER",
    hook: "The drawing is not the whole story; it is the receipt that the studio keeps returning to greatness.",
    thesis: "Keegan's archive is strongest when it shows a pattern of elite achievement, pressure, and impossible detail rather than isolated portraits.",
    proof_asset_refs: ["asset-jordan-process-and-final", "asset-rory-golf-story"],
    missing_capture: ["30-45 second voiceover recorded in studio"],
    story_arc: ["Open with graphite detail", "Move through Jordan/Rory/golf proof as pattern", "Return to the hand as the credibility source", "End on cultural authority, not celebrity access"],
    shot_list: ["macro pencil texture", "hands over work surface", "final artwork crop", "quiet studio wide", "archive proof card if rights allow"],
    edit_instructions: ["Restrained pacing", "No loud flex montage", "Name proof sparingly", "Use on-screen wording that says depicted/associated, not endorsed"],
    caption_or_cta_intent: "Invite serious collectors and cultural operators to see the archive as a body of proof, not a feed of portraits.",
    distribution_format: "REEL",
    positioning_objective: "Reframe from local/process artist to culturally fluent premium graphite artist.",
    rights_status: "REVIEW_REQUIRED",
    production_burden: "MEDIUM",
    approval_required: true,
    do_not_publish_reason: null,
    ai_value_add: ["archive sequence mining", "voiceover draft", "caption draft", "shot order suggestions"],
    human_requirements: ["Keegan voiceover", "human edit pass for taste and pacing", "rights wording review before posting"],
    endorsement_guardrails: ["Do not imply Jordan or Rory endorsement.", "Use cumulative story language, not celebrity proof stacking."]
  },
  {
    contract_version: MEDIA_POSITIONING_CONTRACT_VERSION_V1,
    brief_id: "brief-institutional-legacy-press-kit",
    opportunity_ref: "opp-institutional-legacy-proof",
    recommendation: "ARCHIVE_REPURPOSE",
    hook: "Some work is not just seen; it becomes part of how a moment is remembered.",
    thesis: "The Obama / Presidential Center proof point can support institutional seriousness when the claim is tightly sourced and restrained.",
    proof_asset_refs: ["asset-obama-presidential-center-doc", "asset-major-media-clips"],
    missing_capture: [],
    story_arc: ["Lead with legacy and memory", "Show the verified proof packet", "Connect to graphite permanence", "Close with institution-ready seriousness"],
    shot_list: ["document/proof detail if cleared", "artwork detail", "studio still", "press-kit card"],
    edit_instructions: ["Use static premium pacing", "Avoid personal endorsement language", "Keep exact claim narrow"],
    caption_or_cta_intent: "Support collector/institutional credibility and future press-kit language.",
    distribution_format: "PRESS_KIT_NOTE",
    positioning_objective: "Raise institutional authority without fabricating endorsement.",
    rights_status: "REVIEW_REQUIRED",
    production_burden: "LOW",
    approval_required: true,
    do_not_publish_reason: null,
    ai_value_add: ["claim wording variants", "proof packet summarization", "press-kit note draft"],
    human_requirements: ["provenance verification", "rights/legal wording review"],
    endorsement_guardrails: ["Do not imply Obama endorsed the artist.", "Describe only verified institutional association."]
  },
  {
    contract_version: MEDIA_POSITIONING_CONTRACT_VERSION_V1,
    brief_id: "brief-archive-index-before-publishing",
    opportunity_ref: "opp-archive-mining-music-athletes",
    recommendation: "DO_NOT_PUBLISH_YET",
    hook: "The proof is probably in the archive, but it is not ready for public claims yet.",
    thesis: "Music and athlete proof should first be indexed by person, relationship, quality, and rights status so the best story can emerge safely.",
    proof_asset_refs: ["asset-music-figures-missing-index", "asset-major-media-clips"],
    missing_capture: ["Archive indexing pass", "transcript/story mining", "rights and relationship verification"],
    story_arc: ["No public story until asset identities and rights are verified"],
    shot_list: [],
    edit_instructions: ["Build archive map before edit", "Suppress public drafts with unknown rights"],
    caption_or_cta_intent: "No public CTA; internal archive intelligence task only.",
    distribution_format: "RELATIONSHIP_FOLLOW_UP_ASSET",
    positioning_objective: "Prevent weak or risky public claims while preparing stronger future briefs.",
    rights_status: "UNKNOWN",
    production_burden: "HUMAN_EDITOR_REQUIRED",
    approval_required: true,
    do_not_publish_reason: "Rights, identities, and endorsement-safe wording are not verified.",
    ai_value_add: ["transcript mining", "person/entity tagging", "story clustering", "gap analysis"],
    human_requirements: ["archive producer/editor review", "rights verification", "relationship-context review"],
    endorsement_guardrails: ["Do not name music figures until each proof point is verified.", "Do not imply relationship depth from image proximity."]
  },
  {
    contract_version: MEDIA_POSITIONING_CONTRACT_VERSION_V1,
    brief_id: "brief-event-capture-elite-room",
    opportunity_ref: "opp-next-elite-room-event-capture",
    recommendation: "EVENT_CAPTURE",
    hook: "The room is only useful if the archive captures why the room mattered.",
    thesis: "Future elite-room capture should be designed around cultural context, relationship proof, and premium restraint before the event.",
    proof_asset_refs: [],
    missing_capture: ["event establishing footage", "approved relationship/context stills", "post-event studio reflection", "proof notes from CRM"],
    story_arc: ["Pre-event context", "one restrained room signal", "approved relationship/context proof", "post-event learning"],
    shot_list: ["venue exterior if allowed", "artwork/detail carry-in", "hands/materials", "approved interaction still", "quiet exit/reflection shot"],
    edit_instructions: ["Do not expose private conversations", "Favor restraint over access flexing", "Capture clean audio notes immediately after"],
    caption_or_cta_intent: "Show cultural proximity and seriousness without violating trust.",
    distribution_format: "REEL",
    positioning_objective: "Convert future rooms into durable archive proof and relationship strategy.",
    rights_status: "REVIEW_REQUIRED",
    production_burden: "HUMAN_SHOOTER_REQUIRED",
    approval_required: true,
    do_not_publish_reason: null,
    ai_value_add: ["capture checklist", "post-event transcript mining", "edit blueprint", "caption draft"],
    human_requirements: ["skilled shooter/editor", "permission-aware capture", "Keegan or operator notes after the event"],
    endorsement_guardrails: ["Do not imply hosts, athletes, charities, or institutions endorsed Keegan without proof.", "Protect private relationship context."]
  }
];

export function getMediaPositioningFixtureBundleV1(): MediaPositioningFixtureBundleV1 {
  return {
    contract_version: MEDIA_POSITIONING_CONTRACT_VERSION_V1,
    generated_at: GENERATED_AT,
    proof_points: MEDIA_PROOF_POINT_FIXTURES_V1,
    assets: MEDIA_ASSET_FIXTURES_V1,
    opportunities: MEDIA_OPPORTUNITY_FIXTURES_V1,
    briefs: MEDIA_BRIEF_FIXTURES_V1,
    narrative_queue: MEDIA_BRIEF_FIXTURES_V1.map((brief, index) => {
      const opportunity = MEDIA_OPPORTUNITY_FIXTURES_V1.find((item) => item.opportunity_id === brief.opportunity_ref);
      return {
        queue_id: `media-queue-${String(index + 1).padStart(2, "0")}`,
        opportunity_ref: brief.opportunity_ref,
        brief_ref: brief.brief_id,
        cadence_reason: opportunity?.why_now ?? "Queued because the opportunity has a current narrative or relationship reason.",
        related_cultural_window: opportunity?.cultural_window ?? null,
        relationship_strategy_refs: opportunity?.relationship_strategy_refs ?? [],
        arbitrary_calendar_slot: false
      };
    }),
    archive_ingestion_design: {
      indexed_fields: [
        "person/entity",
        "project/moment",
        "location",
        "capture date",
        "asset quality",
        "rights status",
        "endorsement status",
        "narrative tags",
        "relationship proof refs",
        "reusable excerpt notes"
      ],
      future_connectors: ["CRM/relationship proof #316", "file/media connectors", "transcript stores", "press archive"],
      rights_and_endorsement_policy: [
        "Raw archive proximity is not endorsement.",
        "A person can be depicted, receive work, own work, or appear in media without endorsing Keegan.",
        "Unknown rights must block public publishing and produce an archive/intelligence task instead."
      ],
      ai_value_add: ["transcript/story mining", "archive retrieval", "shot selection suggestions", "script generation", "edit blueprints", "caption/carousel drafts", "gap analysis"],
      human_production_boundaries: [
        "Premium capture in elite rooms still requires a skilled human shooter/editor.",
        "Final public wording requires human approval.",
        "Relationship-sensitive context requires human judgment before publication."
      ]
    }
  };
}
