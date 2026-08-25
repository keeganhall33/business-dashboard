import {
  SPORTS_ART_PARTNER_UNIVERSE_VERSION_V1,
  type SportsArtEvidenceRefV1,
  type SportsArtPartnerCompanyV1,
  type SportsArtPartnerUniverseV1
} from "./contracts";

const fanaticsEvidence: SportsArtEvidenceRefV1[] = [
  { ref_id: "fanatics-public-platform", label: "Fanatics public platform", source: "public_research", url: "https://www.fanaticsinc.com/michael-rubin", truth_state: "KNOWN", notes: "Fanatics describes itself as a global sports platform across fan gear, collectibles/trading cards, betting/prediction markets, content/media, and more." },
  { ref_id: "fanatics-topps-existing-history", label: "Preserved Fanatics/Topps history", source: "issue_preserved_context", truth_state: "KNOWN", notes: "Existing issue context preserves Topps project completion, $10,000 final compensation, stalled lower-level concepts, Rich Kleiman introduction, and named contacts." },
  { ref_id: "topps-existing-opportunity", label: "Existing Topps opportunity", source: "existing_dashboard_record", truth_state: "KNOWN", notes: "Topps sports collectible collaboration: licensing/researching, estimated value $50,000, prestige 9.2, probability 0.35." }
];

const upperDeckEvidence: SportsArtEvidenceRefV1[] = [
  { ref_id: "upper-deck-official-collectibles", label: "Upper Deck official collectibles", source: "public_research", url: "https://upperdeck.com/", truth_state: "KNOWN", notes: "Upper Deck presents sports trading cards, autographed memorabilia, entertainment collectibles, and exclusive athlete memorabilia surfaces." },
  { ref_id: "upper-deck-existing-opportunity", label: "Existing Upper Deck opportunity", source: "existing_dashboard_record", truth_state: "KNOWN", notes: "Upper Deck Hall of Fame capsule: licensing/researching, estimated value $55,000, prestige 9.1, probability 0.32." },
  { ref_id: "upper-deck-preserve-jordan", label: "Preserve Upper Deck/Jordan context", source: "issue_preserved_context", truth_state: "UNKNOWN", notes: "Existing Michael Jordan / Upper Deck relationship, contacts, economics, signing opportunities, reproduction-rights constraints, and negotiations must be preserved where stored elsewhere; this fixture does not replace them." }
];

const publicOnly = (ref_id: string, label: string, url: string, notes: string): SportsArtEvidenceRefV1[] => [
  { ref_id, label, source: "public_research", url, truth_state: "KNOWN", notes }
];

function company(input: SportsArtPartnerCompanyV1): SportsArtPartnerCompanyV1 {
  return input;
}

export const SPORTS_ART_PARTNER_COMPANIES_V1: SportsArtPartnerCompanyV1[] = [
  company({
    company_id: "fanatics",
    company_name: "Fanatics",
    entity_identity: { canonical_name: "Fanatics", aliases: ["Fanatics Inc."], entity_type: "COMPANY", identity_truth_state: "KNOWN" },
    role_classifications: ["TRUE_STRATEGIC_PARTNER", "PARTNER_TARGET", "DISTRIBUTION_TARGET", "ATHLETE_ACCESS", "LICENSING_TARGET"],
    filter_tags: ["PARTNER TARGET", "DISTRIBUTION TARGET", "ATHLETE ACCESS", "LICENSING TARGET"],
    strategic_fit_for_keegan: { level: "HIGH", summary: "Sports-commerce ecosystem with senior-level potential, but only if power dynamic changes beyond generic art pitches.", truth_state: "INFERRED" },
    relationship_state: { level: "LOWER_LEVEL_STALLED", summary: "Keegan has worked with multiple Fanatics/Topps people, but later concepts sent to existing/lower-level contacts largely stalled or were dismissed.", truth_state: "KNOWN" },
    known_contacts_or_access_paths: [
      { name: "Michael Rubin", role_or_path: "Senior strategic target / Fanatics CEO", state: "KNOWN", notes: "Prioritize senior sponsorship, warm validation, or outside leverage." },
      { name: "Rich Kleiman", role_or_path: "Historical introducer to Fanatics/Topps", state: "STALE", notes: "Real historical access path; do not overstate current advocacy." },
      { name: "Clay Luraschi", role_or_path: "Known Fanatics/Topps contact", state: "KNOWN", notes: "Said he would connect Keegan with Fanatics social; later noted Fanatics was not a World Cup licensee." },
      { name: "Mike Mahan", role_or_path: "Known prior contact", state: "KNOWN", notes: "Preserve as named contact; current growth path should not rely on lower-level contact alone." },
      { name: "Kelvin Smith", role_or_path: "Known prior contact", state: "KNOWN", notes: "Preserve as named contact; role needs current verification before action." }
    ],
    prior_outreach_or_deal_history: [
      "Completed a Topps project after Fanatics initially wanted a major art project for free.",
      "Later concepts sent to existing/lower-level contacts have largely stalled or been dismissed.",
      "Preserve My Cards, My City Seattle promotion concept and 2026 World Cup / Space Needle follow-up concept; World Cup version was not a fit because Fanatics was not a World Cup licensee."
    ],
    prior_economics_or_compensation: { summary: "Final compensation was $10,000 despite an estimated ~6 months of work.", truth_state: "KNOWN" },
    licensing_reproduction_rights_relevance: { level: "HIGH", summary: "Fanatics ecosystem can matter for sports rights, collectibles, and distribution, but exact art/reproduction rights path is not established.", truth_state: "INFERRED" },
    athlete_league_team_access_potential: { level: "HIGH", summary: "Potential senior ecosystem access is high; current lower-level access is not enough.", truth_state: "INFERRED" },
    distribution_potential: { level: "HIGH", summary: "Distribution could be meaningful if attached to senior sponsorship and premium-safe economics.", truth_state: "INFERRED" },
    collector_audience_overlap: { level: "HIGH", summary: "Sports collector/fan overlap exists, but fine-art buyer conversion is unproven.", truth_state: "INFERRED" },
    collaboration_concepts: ["Senior-sponsored premium original/story program", "Sports collectible collaboration only with right category/licensing contact", "Collector-room proof tied to athlete/cultural story"],
    competitive_benchmark_relevance: { level: "MEDIUM", summary: "Benchmarks sports-commerce leverage and negotiating power more than direct artist positioning." },
    risks_or_leverage_concerns: ["Do not make Fanatics a single-point-of-failure dependency.", "Prior undercompensation creates negotiating-power concern.", "Lower-level contacts should not define the growth path."],
    current_status: "ACTIVE_RESEARCH",
    timing_or_trigger: "Act only when senior sponsorship, warm validation, or outside leverage changes the power dynamic.",
    next_safe_action: "Map senior sponsor route and category/licensing owner; prepare internal brief, no outreach.",
    approval_state: "NO_ACTION_REQUIRED",
    what_would_materially_change_ranking: ["Verified warm path to Michael Rubin or senior sponsor", "Senior budget owner validates mutual value", "Terms avoid free/underpaid major-art dynamic"],
    preserved_existing_notes: [
      "Keegan worked with multiple people inside Fanatics/Topps and completed a Topps project.",
      "Fanatics initially wanted a major art project for free; final compensation was $10,000 despite ~6 months of work.",
      "Later concepts sent to existing/lower-level contacts largely stalled or were dismissed.",
      "Michael Rubin remains senior strategic target; do not treat lower-level contacts as primary growth path.",
      "Rich Kleiman introduced Keegan to Fanatics/Topps; relationship later cooled.",
      "Preserve Clay Luraschi, Mike Mahan, Kelvin Smith, My Cards My City Seattle, and World Cup / Space Needle concept history."
    ],
    evidence_refs: fanaticsEvidence
  }),
  company({
    company_id: "fanatics-collectibles-topps",
    company_name: "Fanatics Collectibles / Topps",
    entity_identity: { canonical_name: "Topps", aliases: ["Fanatics Collectibles", "Fanatics Collect"], entity_type: "BRAND", identity_truth_state: "KNOWN" },
    role_classifications: ["COLLECTIBLES_TARGET", "LICENSING_TARGET", "DISTRIBUTION_TARGET", "PARTNER_TARGET"],
    filter_tags: ["COLLECTIBLES TARGET", "LICENSING TARGET", "DISTRIBUTION TARGET", "PARTNER TARGET"],
    strategic_fit_for_keegan: { level: "HIGH", summary: "Best fit is a premium collectibles/art-card collaboration with right category/licensing owner, not another generic art pitch.", truth_state: "INFERRED" },
    relationship_state: { level: "WORKED_WITH", summary: "Existing Topps project and opportunity history are known, but current owner/contact for next category path remains unresolved.", truth_state: "KNOWN" },
    known_contacts_or_access_paths: [
      { name: "Clay Luraschi", role_or_path: "Known Topps/Fanatics contact", state: "KNOWN", notes: "Preserved from prior notes." },
      { name: "Mike Mahan", role_or_path: "Known prior contact", state: "KNOWN", notes: "Preserved from prior notes." },
      { name: "Kelvin Smith", role_or_path: "Known prior contact", state: "KNOWN", notes: "Preserved from prior notes." }
    ],
    prior_outreach_or_deal_history: ["Completed Topps project.", "Existing Topps sports collectible collaboration remains licensing/researching."],
    prior_economics_or_compensation: { summary: "Existing opportunity estimated value $50,000; prestige 9.2; probability 0.35. Prior Fanatics/Topps compensation context includes $10,000 for ~6 months of work.", truth_state: "KNOWN" },
    licensing_reproduction_rights_relevance: { level: "HIGH", summary: "Topps/Fanatics Collectibles is directly relevant to trading card and collectibles licensing/reproduction concepts.", truth_state: "KNOWN" },
    athlete_league_team_access_potential: { level: "HIGH", summary: "Collectibles category implies sports-license relevance; exact athlete/team access for Keegan remains UNKNOWN.", truth_state: "INFERRED" },
    distribution_potential: { level: "HIGH", summary: "Collectibles channels could distribute limited art-card collaborations if category owner and economics are right.", truth_state: "INFERRED" },
    collector_audience_overlap: { level: "HIGH", summary: "Sports-card collectors overlap culturally; fine-art premium conversion remains unproven.", truth_state: "INFERRED" },
    collaboration_concepts: ["Topps sports collectible collaboration", "Premium art-card capsule", "Category-specific licensing concept tied to proven collectible demand"],
    competitive_benchmark_relevance: { level: "MEDIUM", summary: "Benchmark for sports collectibles economics and licensing leverage." },
    risks_or_leverage_concerns: ["Must not repeat underpaid major-art dynamic.", "Right category/licensing contact unknown.", "Generic social/content pitch is weak."],
    current_status: "ACTIVE_RESEARCH",
    timing_or_trigger: "Trigger when correct category/licensing contact is identified and economics are bounded.",
    next_safe_action: "Identify right category/licensing contact and tailor angle; preserve current opportunity state.",
    approval_state: "NO_ACTION_REQUIRED",
    what_would_materially_change_ranking: ["Category owner identified", "Rights/economics terms become known", "Senior sponsor attaches budget and distribution"],
    preserved_existing_notes: ["Topps sports collectible collaboration: licensing/researching, $50,000 estimated value, prestige 9.2, probability 0.35.", "Current next step remains identify right category/licensing contact and tailor angle unless newer evidence supersedes it."],
    evidence_refs: fanaticsEvidence
  }),
  company({
    company_id: "panini",
    company_name: "Panini",
    entity_identity: { canonical_name: "Panini America", aliases: ["Panini"], entity_type: "COMPANY", identity_truth_state: "KNOWN" },
    role_classifications: ["COLLECTIBLES_TARGET", "LICENSING_TARGET", "DISTRIBUTION_TARGET", "ATHLETE_ACCESS"],
    filter_tags: ["COLLECTIBLES TARGET", "LICENSING TARGET", "DISTRIBUTION TARGET", "ATHLETE ACCESS"],
    strategic_fit_for_keegan: { level: "MEDIUM", summary: "Relevant sports collectibles and licensing target, but no known relationship or buyer intent is evidenced.", truth_state: "INFERRED" },
    relationship_state: { level: "UNKNOWN", summary: "No existing GitHub issue intelligence found; CRM/email/project data not searched here, so relationship is UNKNOWN, not NONE.", truth_state: "UNKNOWN" },
    known_contacts_or_access_paths: [{ name: "UNKNOWN", role_or_path: "Licensing/category owner", state: "UNKNOWN", notes: "Needs public/contact-role research before any action." }],
    prior_outreach_or_deal_history: ["UNKNOWN"],
    prior_economics_or_compensation: { summary: "UNKNOWN", truth_state: "UNKNOWN" },
    licensing_reproduction_rights_relevance: { level: "HIGH", summary: "Sports trading-card and collectibles category makes licensing/reproduction relevance plausible.", truth_state: "INFERRED" },
    athlete_league_team_access_potential: { level: "MEDIUM", summary: "Potential access through collectibles programs, but current rights/category fit for Keegan is UNKNOWN.", truth_state: "INFERRED" },
    distribution_potential: { level: "HIGH", summary: "Collectibles distribution potential is plausible; premium fine-art distribution fit is unproven.", truth_state: "INFERRED" },
    collector_audience_overlap: { level: "HIGH", summary: "Sports-card collector overlap is likely; premium art conversion remains UNKNOWN.", truth_state: "INFERRED" },
    collaboration_concepts: ["Sports-card art insert/capsule", "Athlete-heritage collectible art concept", "Benchmark Panini category economics against Topps/Upper Deck"],
    competitive_benchmark_relevance: { level: "HIGH", summary: "Important benchmark against Fanatics/Topps and Upper Deck collectibles paths." },
    risks_or_leverage_concerns: ["No relationship evidence.", "Rights/economics unknown.", "Could pull brand toward mass collectibles unless tightly positioned."],
    current_status: "WATCH",
    timing_or_trigger: "Trigger when a rights-safe category owner or premium collection surface is identified.",
    next_safe_action: "Research current category/licensing owner and active sports-art-adjacent programs; no outreach.",
    approval_state: "NO_ACTION_REQUIRED",
    what_would_materially_change_ranking: ["Known category owner", "Evidence of premium art-card appetite", "Warm path or senior sponsor emerges"],
    preserved_existing_notes: ["No existing GitHub issue intelligence found; do not assume no relationship without CRM/email/project search."],
    evidence_refs: publicOnly("panini-public-blog", "Panini official public surfaces", "https://blog.paniniamerica.net/", "Panini America public blog shows ongoing multi-sport trading card/collectibles activity.")
  }),
  company({
    company_id: "upper-deck",
    company_name: "Upper Deck",
    entity_identity: { canonical_name: "Upper Deck", aliases: ["The Upper Deck Company"], entity_type: "COMPANY", identity_truth_state: "KNOWN" },
    role_classifications: ["COLLECTIBLES_TARGET", "LICENSING_TARGET", "ATHLETE_ACCESS", "DISTRIBUTION_TARGET", "PARTNER_TARGET"],
    filter_tags: ["COLLECTIBLES TARGET", "LICENSING TARGET", "ATHLETE ACCESS", "DISTRIBUTION TARGET", "PARTNER TARGET"],
    strategic_fit_for_keegan: { level: "HIGH", summary: "Premium collectibles, athlete-signed art, and Hall of Fame capsule fit Keegan's sports-art authority positioning.", truth_state: "INFERRED" },
    relationship_state: { level: "UNKNOWN", summary: "Existing opportunity exists; contact, buyer intent, and current relationship depth remain UNKNOWN in available tests.", truth_state: "UNKNOWN" },
    known_contacts_or_access_paths: [{ name: "UNKNOWN creative director/licensing contact", role_or_path: "Current next step is to map this owner", state: "UNKNOWN", notes: "Preserve existing next step." }],
    prior_outreach_or_deal_history: ["Existing Upper Deck Hall of Fame capsule opportunity is licensing/researching."],
    prior_economics_or_compensation: { summary: "Existing opportunity estimated value $55,000; prestige 9.1; probability 0.32.", truth_state: "KNOWN" },
    licensing_reproduction_rights_relevance: { level: "HIGH", summary: "Upper Deck trading cards, memorabilia, and exclusive athlete surfaces make licensing/reproduction constraints central.", truth_state: "KNOWN" },
    athlete_league_team_access_potential: { level: "HIGH", summary: "Upper Deck public surfaces include exclusive athletes and authenticated memorabilia; exact access for Keegan remains UNKNOWN.", truth_state: "INFERRED" },
    distribution_potential: { level: "HIGH", summary: "Collectibles and memorabilia distribution could be meaningful if premium fit and rights are handled.", truth_state: "INFERRED" },
    collector_audience_overlap: { level: "HIGH", summary: "Strong collector audience overlap; fine-art buyer conversion and terms remain UNKNOWN.", truth_state: "INFERRED" },
    collaboration_concepts: ["Upper Deck Hall of Fame capsule", "Athlete-signed original-art/memorabilia capsule", "Premium authenticated sports art series"],
    competitive_benchmark_relevance: { level: "HIGH", summary: "Key benchmark for premium collectibles, authenticated memorabilia, and athlete-access model." },
    risks_or_leverage_concerns: ["Buyer intent unknown.", "Reproduction-rights constraints and prior negotiations must not be flattened.", "Michael Jordan/Upper Deck context must be preserved from canonical records."],
    current_status: "ACTIVE_RESEARCH",
    timing_or_trigger: "Trigger when creative director/licensing contact and reproduction-rights constraints are mapped.",
    next_safe_action: "Map creative director/licensing contact and prepare prestige pitch; no outreach.",
    approval_state: "NO_ACTION_REQUIRED",
    what_would_materially_change_ranking: ["Known creative/licensing owner", "Rights constraints become clear", "Michael Jordan or Hall of Fame access path becomes verified"],
    preserved_existing_notes: [
      "Upper Deck Hall of Fame capsule: licensing/researching, $55,000 estimated value, prestige 9.1, probability 0.32.",
      "Next step remains map creative director/licensing contact and prepare a prestige pitch unless newer evidence supersedes it.",
      "Preserve Michael Jordan / Upper Deck relationship history, contacts, economics, original-art signing opportunities, reproduction-rights constraints, and prior negotiations wherever stored elsewhere."
    ],
    evidence_refs: upperDeckEvidence
  }),
  company({
    company_id: "fine-art-america-pixels",
    company_name: "Fine Art America / Pixels",
    entity_identity: { canonical_name: "Fine Art America", aliases: ["Pixels", "Pixels.com"], entity_type: "COMPANY", identity_truth_state: "KNOWN" },
    role_classifications: ["MARKET_COMPETITIVE_BENCHMARK", "DISTRIBUTION_TARGET", "BENCHMARK"],
    filter_tags: ["BENCHMARK", "DISTRIBUTION TARGET", "COMPETITOR"],
    strategic_fit_for_keegan: { level: "LOW", summary: "Useful as mass-market distribution/pricing/merchandising benchmark; partnership potential is secondary and may dilute premium positioning.", truth_state: "INFERRED" },
    relationship_state: { level: "UNKNOWN", summary: "No issue intelligence found; relationship state UNKNOWN pending CRM/email/project data.", truth_state: "UNKNOWN" },
    known_contacts_or_access_paths: [{ name: "UNKNOWN", role_or_path: "Platform/business development contact", state: "UNKNOWN", notes: "Not priority unless distribution benchmark reveals premium-safe use." }],
    prior_outreach_or_deal_history: ["UNKNOWN"],
    prior_economics_or_compensation: { summary: "UNKNOWN", truth_state: "UNKNOWN" },
    licensing_reproduction_rights_relevance: { level: "MEDIUM", summary: "Platform supports art sales/licensing configurations, but sports-rights relevance is not established.", truth_state: "INFERRED" },
    athlete_league_team_access_potential: { level: "LOW", summary: "No athlete/league access evidence from public platform role.", truth_state: "INFERRED" },
    distribution_potential: { level: "HIGH", summary: "Mass-market print-on-demand distribution benchmark, not necessarily premium-safe distribution.", truth_state: "KNOWN" },
    collector_audience_overlap: { level: "LOW", summary: "Broad art/merch audience; high-end collector overlap is UNKNOWN.", truth_state: "UNKNOWN" },
    collaboration_concepts: ["Use only as distribution/pricing benchmark", "Evaluate print-on-demand economics as cautionary mass-market reference"],
    competitive_benchmark_relevance: { level: "HIGH", summary: "Benchmark for what to avoid if premium scarcity is the goal." },
    risks_or_leverage_concerns: ["Mass-market positioning could dilute premium brand.", "Not a senior sports-art strategic partner.", "Sports licensing/access weak."],
    current_status: "BENCHMARK_ONLY",
    timing_or_trigger: "Review only when distribution economics or merchandising benchmark matters.",
    next_safe_action: "Benchmark economics and positioning; do not pursue partnership by default.",
    approval_state: "NO_ACTION_REQUIRED",
    what_would_materially_change_ranking: ["Premium-only distribution path appears", "High-end collector conversion evidence appears", "Rights-safe sports category support is verified"],
    preserved_existing_notes: ["No existing GitHub issue intelligence found; do not assume no relationship without CRM/email/project search."],
    evidence_refs: publicOnly("fine-art-america-public-marketplace", "Fine Art America public marketplace", "https://fineartamerica.com/", "Fine Art America describes itself as a large art marketplace and print-on-demand technology company.")
  }),
  company({
    company_id: "art-of-words",
    company_name: "Art of Words",
    entity_identity: { canonical_name: "Art of Words", aliases: ["Dan Duffy Art of Words"], entity_type: "ARTIST_STUDIO", identity_truth_state: "KNOWN" },
    role_classifications: ["BENCHMARK", "COLLABORATOR", "MARKET_COMPETITIVE_BENCHMARK"],
    filter_tags: ["BENCHMARK", "COLLABORATOR", "COMPETITOR"],
    strategic_fit_for_keegan: { level: "MEDIUM", summary: "Useful artist-led sports-art benchmark and possible collaborator/channel comparison, not a primary strategic partner.", truth_state: "INFERRED" },
    relationship_state: { level: "UNKNOWN", summary: "No issue intelligence found; relationship state UNKNOWN.", truth_state: "UNKNOWN" },
    known_contacts_or_access_paths: [{ name: "Dan Duffy", role_or_path: "Artist / creator", state: "KNOWN", notes: "Public identity; no relationship access asserted." }],
    prior_outreach_or_deal_history: ["UNKNOWN"],
    prior_economics_or_compensation: { summary: "Public prints are lower-price sports fan gifts; Keegan economics/compensation UNKNOWN.", truth_state: "UNKNOWN" },
    licensing_reproduction_rights_relevance: { level: "LOW", summary: "Benchmark for artist-led sports prints; rights/licensing leverage for Keegan is UNKNOWN.", truth_state: "UNKNOWN" },
    athlete_league_team_access_potential: { level: "LOW", summary: "No athlete/league access evidence found in public benchmark scan.", truth_state: "UNKNOWN" },
    distribution_potential: { level: "MEDIUM", summary: "Direct-to-consumer sports print distribution benchmark.", truth_state: "KNOWN" },
    collector_audience_overlap: { level: "MEDIUM", summary: "Sports fan overlap exists; premium collector overlap is unclear.", truth_state: "INFERRED" },
    collaboration_concepts: ["Benchmark storytelling/detail density", "Potential sports-artist peer comparison or low-risk collaborator research"],
    competitive_benchmark_relevance: { level: "HIGH", summary: "Benchmark for sports fan print market and differentiated format positioning." },
    risks_or_leverage_concerns: ["Could pull comparison toward lower-priced fan decor.", "Not equivalent to strategic ecosystem partner."],
    current_status: "BENCHMARK_ONLY",
    timing_or_trigger: "Use when comparing sports-art category positioning.",
    next_safe_action: "Benchmark offer/pricing/message; no outreach.",
    approval_state: "NO_ACTION_REQUIRED",
    what_would_materially_change_ranking: ["Evidence of premium collector base", "Warm collaborator path", "Licensed/team access evidence"],
    preserved_existing_notes: ["No existing GitHub issue intelligence found; do not assume no relationship without CRM/email/project search."],
    evidence_refs: publicOnly("art-of-words-public-sports-art", "Art of Words sports art", "https://www.artofwords.com/collections/sports-art", "Art of Words sells sports word-art prints featuring teams, stadiums, players, stats, rosters, and sports moments.")
  }),
  company({
    company_id: "s-preston",
    company_name: "S. Preston",
    entity_identity: { canonical_name: "S. Preston", aliases: ["S. Preston Designs"], entity_type: "ARTIST_STUDIO", identity_truth_state: "KNOWN" },
    role_classifications: ["BENCHMARK", "COMPETITOR", "COLLABORATOR", "LICENSING_TARGET"],
    filter_tags: ["BENCHMARK", "COMPETITOR", "COLLABORATOR", "LICENSING TARGET"],
    strategic_fit_for_keegan: { level: "MEDIUM", summary: "Strong licensed sports-art benchmark and possible collaborator/category positioning comparison.", truth_state: "INFERRED" },
    relationship_state: { level: "UNKNOWN", summary: "No issue intelligence found; relationship state UNKNOWN.", truth_state: "UNKNOWN" },
    known_contacts_or_access_paths: [{ name: "S. Preston", role_or_path: "Licensed sports artist", state: "KNOWN", notes: "Public artist identity; no relationship access asserted." }],
    prior_outreach_or_deal_history: ["UNKNOWN"],
    prior_economics_or_compensation: { summary: "UNKNOWN", truth_state: "UNKNOWN" },
    licensing_reproduction_rights_relevance: { level: "HIGH", summary: "Public materials present licensed MLB/NHL/Team USA artist positioning; useful licensing benchmark.", truth_state: "KNOWN" },
    athlete_league_team_access_potential: { level: "MEDIUM", summary: "League/team license relevance is high; direct athlete access potential UNKNOWN.", truth_state: "INFERRED" },
    distribution_potential: { level: "MEDIUM", summary: "Licensed art distribution/category presence is benchmark-relevant.", truth_state: "INFERRED" },
    collector_audience_overlap: { level: "MEDIUM", summary: "Sports art buyer overlap likely; premium graphite collector overlap UNKNOWN.", truth_state: "INFERRED" },
    collaboration_concepts: ["Benchmark league licensing path", "Study category positioning and press/institutional proof", "Potential peer collaborator only if brand-elevating"],
    competitive_benchmark_relevance: { level: "HIGH", summary: "Strong benchmark for licensed sports-art category legitimacy." },
    risks_or_leverage_concerns: ["Collaboration could blur differentiation.", "Licensing model may not fit hyper-realistic premium original strategy."],
    current_status: "BENCHMARK_ONLY",
    timing_or_trigger: "Use when evaluating licensed sports-art path or category proof.",
    next_safe_action: "Benchmark license/press/category model; no outreach.",
    approval_state: "NO_ACTION_REQUIRED",
    what_would_materially_change_ranking: ["Warm relationship path", "Clear mutually elevating collaboration concept", "Evidence licensing path would strengthen Keegan's premium positioning"],
    preserved_existing_notes: ["No existing GitHub issue intelligence found; do not assume no relationship without CRM/email/project search."],
    evidence_refs: publicOnly("s-preston-public-licensed", "S. Preston licensed sports artist public page", "https://www.sprestondesigns.com/pages/s-preston-in-the-media", "Public page states S. Preston is officially licensed by MLB, NHL, Team USA and other brands, with Baseball Hall of Fame archive relevance.")
  }),
  company({
    company_id: "farano-fine-art",
    company_name: "Farano Fine Art",
    entity_identity: { canonical_name: "Farano Fine Art", aliases: ["Justyn Farano"], entity_type: "ARTIST_STUDIO", identity_truth_state: "KNOWN" },
    role_classifications: ["BENCHMARK", "COMPETITOR", "COLLABORATOR", "MARKET_COMPETITIVE_BENCHMARK"],
    filter_tags: ["BENCHMARK", "COMPETITOR", "COLLABORATOR"],
    strategic_fit_for_keegan: { level: "MEDIUM", summary: "Premium sports fine-art benchmark and possible collaborator/competitive intelligence target.", truth_state: "INFERRED" },
    relationship_state: { level: "UNKNOWN", summary: "No issue intelligence found; relationship state UNKNOWN.", truth_state: "UNKNOWN" },
    known_contacts_or_access_paths: [{ name: "Justyn Farano", role_or_path: "Founder / artist", state: "KNOWN", notes: "Public identity; no relationship access asserted." }],
    prior_outreach_or_deal_history: ["UNKNOWN"],
    prior_economics_or_compensation: { summary: "UNKNOWN", truth_state: "UNKNOWN" },
    licensing_reproduction_rights_relevance: { level: "HIGH", summary: "Public artist bio indicates licensing by major leagues; relevant benchmark for rights and official-artist status.", truth_state: "KNOWN" },
    athlete_league_team_access_potential: { level: "MEDIUM", summary: "Official artist/licensing status suggests category access, but direct access path for Keegan is UNKNOWN.", truth_state: "INFERRED" },
    distribution_potential: { level: "MEDIUM", summary: "Premium sports fine-art brand offers positioning benchmark more than mass distribution target.", truth_state: "INFERRED" },
    collector_audience_overlap: { level: "HIGH", summary: "Premium sports fine-art collector overlap is likely; exact buyer overlap UNKNOWN.", truth_state: "INFERRED" },
    collaboration_concepts: ["Benchmark premium sports fine-art positioning", "Study league-license and Hall of Fame proof points", "Possible peer collaborator only if it raises category authority"],
    competitive_benchmark_relevance: { level: "HIGH", summary: "Important premium sports fine-art benchmark and competitive intelligence target." },
    risks_or_leverage_concerns: ["Direct competitor/collaborator boundary must be handled carefully.", "Do not imitate; use benchmark to sharpen differentiation."],
    current_status: "BENCHMARK_ONLY",
    timing_or_trigger: "Use when evaluating premium sports-art positioning and official-artist proof.",
    next_safe_action: "Benchmark premium positioning, licensing proof, and collector-facing offer; no outreach.",
    approval_state: "NO_ACTION_REQUIRED",
    what_would_materially_change_ranking: ["Warm relationship path", "Evidence of mutually elevating collaboration", "Comparable pricing/economics become known"],
    preserved_existing_notes: ["No existing GitHub issue intelligence found; do not assume no relationship without CRM/email/project search."],
    evidence_refs: publicOnly("farano-public-official-artist", "Farano Fine Art public artist page", "https://faranofineart.com/pages/the-artist", "Public artist page says Farano paintings are licensed by MLB, NFL, NHL, NBA and more, and that Farano is an Official Artist of the Baseball Hall of Fame.")
  })
].sort((a, b) => a.company_id.localeCompare(b.company_id));

export const SPORTS_ART_PARTNER_UNIVERSE_FIXTURE_V1: SportsArtPartnerUniverseV1 = {
  contract_version: SPORTS_ART_PARTNER_UNIVERSE_VERSION_V1,
  universe_id: "sports-art-partner-benchmark-universe-v1",
  as_of: "2026-08-25",
  source: "fixture_reconciled_public_research",
  companies: SPORTS_ART_PARTNER_COMPANIES_V1,
  ranking_principle: {
    not_ranked_by_company_size_only: true,
    fanatics_single_point_of_failure_guardrail: true,
    factors: [
      "strategic leverage",
      "access to athletes/leagues/collectors",
      "rights/licensing leverage",
      "economics and negotiating power",
      "prestige / credibility transfer",
      "distribution reach",
      "relationship accessibility",
      "independence / concentration risk",
      "fit with premium positioning",
      "repeatable rather than one-off value"
    ]
  },
  safety: {
    no_external_outreach: true,
    no_duplicate_company_contact_or_opportunity_records_created: true,
    keegan_action_required: "NO"
  }
};
