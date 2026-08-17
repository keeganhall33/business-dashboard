import type { CreativeDirectionCandidate, CreativeDirectionRoadmap, EvidenceReference } from "./contracts";

export const creativeDirectionEvidenceFixtures: EvidenceReference[] = [
  {
    evidenceId: "evidence-art-basel-ubs-hnw-painting-demand",
    title: "Art Basel and UBS collector research baseline: paintings remain dominant for HNW collectors",
    publisher: "Art Basel / UBS",
    sourceType: "MARKET_REPORT",
    observedAt: "2026-08-01",
    signalClass: "CURRENT_DEMAND",
    claimSummary:
      "Fixture encodes the cited baseline that paintings remain dominant in HNW collector purchasing and spending; it does not by itself mandate a painting recommendation.",
    provenance: {
      citationLabel: "Art Basel/UBS market and collector research baseline fixture",
      url: null,
      collectionMethod: "FIXTURE_BASELINE"
    }
  },
  {
    evidenceId: "evidence-auction-category-sculpture",
    title: "Auction category baseline: sculpture remains a major physical medium",
    publisher: "Auction-house category research fixture",
    sourceType: "AUCTION_RESEARCH",
    observedAt: "2026-08-01",
    signalClass: "CURRENT_DEMAND",
    claimSummary:
      "Fixture encodes sculpture as a durable major physical medium while preserving capacity, learning-curve, and brand-fit constraints.",
    provenance: {
      citationLabel: "Auction-house category/market research baseline fixture",
      url: null,
      collectionMethod: "FIXTURE_BASELINE"
    }
  },
  {
    evidenceId: "evidence-works-on-paper-collector-category",
    title: "Works on paper baseline: meaningful collector category",
    publisher: "Market category research fixture",
    sourceType: "CATEGORY_RESEARCH",
    observedAt: "2026-08-01",
    signalClass: "LONG_TERM_PRESTIGE",
    claimSummary:
      "Fixture encodes works on paper as a meaningful collector category that supports graphite authority without fabricating a dollar ceiling.",
    provenance: {
      citationLabel: "Works-on-paper category baseline fixture",
      url: null,
      collectionMethod: "FIXTURE_BASELINE"
    }
  },
  {
    evidenceId: "evidence-younger-collector-digital-expansion",
    title: "Younger collector digital art participation and spending expansion baseline",
    publisher: "Collector behavior research fixture",
    sourceType: "MARKET_REPORT",
    observedAt: "2026-08-01",
    signalClass: "COLLECTOR_BEHAVIOR",
    claimSummary:
      "Fixture encodes materially higher and recently expanded digital participation among younger collectors, without treating digital as a replacement for physical authorship.",
    provenance: {
      citationLabel: "Digital/new-media adoption baseline fixture",
      url: null,
      collectionMethod: "FIXTURE_BASELINE"
    }
  },
  {
    evidenceId: "evidence-direct-from-artist-expanded",
    title: "Direct-from-artist and studio buying expansion baseline",
    publisher: "Collector channel research fixture",
    sourceType: "MARKET_REPORT",
    observedAt: "2026-08-01",
    signalClass: "DIRECT_ARTIST",
    claimSummary:
      "Fixture encodes expanded direct-from-artist buying as a reason to make recommendations executable from the studio, not as proof of broad demand.",
    provenance: {
      citationLabel: "Direct-from-artist/studio buying baseline fixture",
      url: null,
      collectionMethod: "FIXTURE_BASELINE"
    }
  },
  {
    evidenceId: "evidence-surrealism-market-strength",
    title: "Surrealism market strength and contemporary influence baseline",
    publisher: "Auction and contemporary category research fixture",
    sourceType: "AUCTION_RESEARCH",
    observedAt: "2026-08-01",
    signalClass: "LONG_TERM_PRESTIGE",
    claimSummary:
      "Fixture encodes notable Surrealism market strength and contemporary influence as support for symbolic environments and open visual territory.",
    provenance: {
      citationLabel: "Surrealism market/category baseline fixture",
      url: null,
      collectionMethod: "FIXTURE_BASELINE"
    }
  }
];

export const creativeDirectionCandidateFixtures: CreativeDirectionCandidate[] = [
  {
    DIRECTION_ID: "cdv1-graphite-flagship-evolution",
    MEDIUM: "Graphite drawing on archival paper",
    MATERIALS: ["archival cotton paper", "graphite", "charcoal-black graphite accents", "museum-grade framing"],
    SIZE_SCALE: "Large wall work, roughly 40 x 60 inches or larger where subject/reference quality supports it",
    SUBJECT_OR_NON_SUBJECT: "Iconic culturally durable sports or entertainment figure with rights/reference clearance required",
    COMPOSITION: "Single commanding figure cropped close enough for presence, with a restrained field that keeps the hand evidence visible",
    PALETTE_COLOR_LOGIC: "Monochrome graphite value range; no color unless a future test proves brand lift",
    LIGHTING: "Directional cinematic light with high-control transitions across skin, fabric, and negative field",
    DETAIL_EDGE_TREATMENT: "Hyperreal focal detail with deliberately softer peripheral edges to avoid pure reproduction energy",
    NEGATIVE_SPACE: "Quiet negative space used as luxury restraint and institutional breathing room",
    FIGURATION_ABSTRACTION_SURREAL_HYBRID: "Primarily figuration with subtle symbolic absence rather than overt surrealism",
    PHYSICAL_DEPTH_OR_RELIEF: "Flat work; depth comes from graphite value control and framing presence",
    SERIES_STRUCTURE: "Tightly edited flagship series of 3-5 works, each with a clear cultural thesis",
    DISPLAY_INSTALLATION: "Museum-grade frame, generous mat or float mount, wall label emphasizing hand process and cultural subject",
    TARGET_COLLECTOR_OR_INSTITUTION: "High-end sports, entertainment, and culture collectors who value mastery and recognizable subjects",
    CURRENT_MARKET_SIGNAL: "Works on paper remain meaningful and direct-from-artist buying supports studio-led placement",
    LONG_TERM_PRESTIGE_SIGNAL: "Graphite mastery is Keegan's strongest authority signal and compounds through recognizable technical authorship",
    DIFFERENTIATION: "Best preserves the signature scarcity and hand-skill advantage competitors cannot quickly copy",
    KEEGAN_BRAND_FIT: "Highest fit: museum-level graphite craft is the brand's core proof of rarity",
    LEARNING_CURVE: "Low relative learning curve; improvement comes from composition, thesis, and subject discipline",
    CAPACITY_COST: "High time cost but predictable materials and process risk",
    PRICE_CEILING_OR_ECONOMIC_NOTES: "Do not fabricate a dollar ceiling; price ceiling depends on collector proof, subject relevance, scarcity, and institutional association",
    RIGHTS_REFERENCE_CONSTRAINTS: "Requires cleared or sufficiently authorized reference path for recognizable subjects",
    SHORT_PATH_VALUE: "Shortest path to premium positioning because it reinforces existing authority immediately",
    COMPOUNDING_ASSET_VALUE: "High; each flagship work strengthens the visible body of evidence for craftsmanship and cultural taste",
    BRAND_CONFUSION_RISK: "Low if subject selection stays culturally significant and not commission-volume driven",
    CONFIDENCE: "HIGH",
    CRITICAL_UNKNOWNS: ["Which subjects produce elite collector pull without rights friction", "Which scale commands best in person"],
    SUCCESS_CRITERIA: [
      "Collector inquiry quality improves without discounting",
      "Work can be explained as a cultural thesis, not only a portrait",
      "At least one premium placement or serious institutional conversation emerges"
    ],
    WHAT_WOULD_CHANGE_THE_RECOMMENDATION: [
      "First-party collector response weakens across multiple flagship graphite releases",
      "Rights/reference constraints make the best subjects unavailable",
      "A tested hybrid creates stronger prestige without confusing the brand"
    ],
    STAGE: "KEEP_NOW",
    evidenceIds: [
      "evidence-works-on-paper-collector-category",
      "evidence-direct-from-artist-expanded",
      "evidence-art-basel-ubs-hnw-painting-demand"
    ],
    decisionNotes: [
      "Current market demand is supportive but not the sole reason for KEEP_NOW",
      "Long-term differentiation and Keegan brand fit carry the decision"
    ]
  },
  {
    DIRECTION_ID: "cdv1-graphite-selective-material-color",
    MEDIUM: "Graphite drawing with restrained selective color or material intervention",
    MATERIALS: ["archival paper", "graphite", "one controlled color material", "possibly metal leaf or pigment test strip"],
    SIZE_SCALE: "Medium to large works, 30 x 44 inches to 48 x 72 inches depending on intervention control",
    SUBJECT_OR_NON_SUBJECT: "Recognizable figure or artifact detail anchored by graphite realism",
    COMPOSITION: "Graphite realism owns the field; one color/material decision marks status, motion, or cultural symbol",
    PALETTE_COLOR_LOGIC: "Nearly monochrome with one restrained accent chosen for meaning, not decoration",
    LIGHTING: "Graphite light logic remains dominant; material intervention catches light only in a controlled zone",
    DETAIL_EDGE_TREATMENT: "Focal realism remains crisp while the intervention is physically or chromatically isolated",
    NEGATIVE_SPACE: "Negative space protects premium restraint and prevents novelty from overtaking authorship",
    FIGURATION_ABSTRACTION_SURREAL_HYBRID: "Figuration with symbolic material punctuation",
    PHYSICAL_DEPTH_OR_RELIEF: "Mostly flat, with optional shallow material lift for test works",
    SERIES_STRUCTURE: "Two-work test pair against a pure graphite control",
    DISPLAY_INSTALLATION: "Frame and lighting must reveal material shift without reading as decorative mixed media",
    TARGET_COLLECTOR_OR_INSTITUTION: "Collectors who already respect graphite but respond to an additional visual signature",
    CURRENT_MARKET_SIGNAL: "Painting/color demand is noted, but selective intervention must prove brand lift before scaling",
    LONG_TERM_PRESTIGE_SIGNAL: "Potentially creates a proprietary visual mechanism if it stays restrained and concept-led",
    DIFFERENTIATION: "Moderate-to-high if the intervention becomes instantly recognizable as Keegan's system",
    KEEGAN_BRAND_FIT: "Strong if graphite remains dominant; weaker if color becomes the hook",
    LEARNING_CURVE: "Medium; material tests can fail visibly and require archival confidence",
    CAPACITY_COST: "Medium materials/process cost; modest additional time per work after tests",
    PRICE_CEILING_OR_ECONOMIC_NOTES: "No dollar claim; economics depend on whether collectors value the intervention as authorship rather than novelty",
    RIGHTS_REFERENCE_CONSTRAINTS: "Same subject/reference constraints as flagship graphite, plus archival material diligence",
    SHORT_PATH_VALUE: "Useful near-term experiment but should not distract from flagship graphite cadence",
    COMPOUNDING_ASSET_VALUE: "Medium; high only if the visual mechanism becomes repeatable and scarce",
    BRAND_CONFUSION_RISK: "Medium if color reads as trend-chasing or an attempt to become a painter",
    CONFIDENCE: "MEDIUM",
    CRITICAL_UNKNOWNS: ["Whether elite collectors perceive the accent as premium", "Archival behavior of selected material"],
    SUCCESS_CRITERIA: [
      "Side-by-side collector feedback prefers the intervention for the right reason",
      "The graphite authority remains the first read",
      "The material language can repeat without becoming formulaic"
    ],
    WHAT_WOULD_CHANGE_THE_RECOMMENDATION: [
      "A test work earns stronger serious collector response than pure graphite",
      "The intervention lowers perceived craft or creates archival doubt",
      "Material costs or production time reduce flagship output"
    ],
    STAGE: "TEST_NOW",
    evidenceIds: ["evidence-art-basel-ubs-hnw-painting-demand", "evidence-direct-from-artist-expanded"],
    decisionNotes: ["Painting popularity alone cannot convert this to KEEP_NOW or PAINT_NOW"]
  },
  {
    DIRECTION_ID: "cdv1-graphite-surreal-symbolic-environment",
    MEDIUM: "Graphite focal realism inside surreal or abstract symbolic environment",
    MATERIALS: ["archival paper", "graphite", "charcoal powder or graphite wash for atmospheric fields"],
    SIZE_SCALE: "Large statement works, 44 x 60 inches and up",
    SUBJECT_OR_NON_SUBJECT: "Focal figure, object, or body fragment embedded in symbolic cultural terrain",
    COMPOSITION: "Hyperreal focal anchor surrounded by surreal architecture, shadows, thresholds, or abstract pressure fields",
    PALETTE_COLOR_LOGIC: "Monochrome or near-monochrome; value contrast separates real, symbolic, and void zones",
    LIGHTING: "Impossible but controlled light: realistic subject lighting meets staged symbolic illumination",
    DETAIL_EDGE_TREATMENT: "Extreme focal detail dissolves into atmospheric, abstract, or dream-edge transitions",
    NEGATIVE_SPACE: "Negative space becomes meaning: pause, absence, pressure, or unresolved cultural tension",
    FIGURATION_ABSTRACTION_SURREAL_HYBRID: "Hybrid of figuration, abstraction, and surreal symbolic environment",
    PHYSICAL_DEPTH_OR_RELIEF: "Flat work with spatial illusion; relief reserved for later translation",
    SERIES_STRUCTURE: "Narrative series of 3 works testing one symbolic grammar before broadening",
    DISPLAY_INSTALLATION: "Large quiet wall with enough distance for surreal field to read as composition, not background",
    TARGET_COLLECTOR_OR_INSTITUTION: "Collectors and curators who need more than likeness: cultural thesis, visual language, and technical authority",
    CURRENT_MARKET_SIGNAL: "Surrealism influence and direct studio buying support a test of symbolic territory",
    LONG_TERM_PRESTIGE_SIGNAL: "High potential because it moves from portrait skill toward proprietary visual language",
    DIFFERENTIATION: "High if the symbolic grammar is specific to Keegan and not generic surreal mood",
    KEEGAN_BRAND_FIT: "Strong if hyperreal graphite remains the proof point and symbolism adds authorship",
    LEARNING_CURVE: "Medium-high; requires composition discipline and strong concept editing",
    CAPACITY_COST: "High time cost; concept development adds risk before drawing begins",
    PRICE_CEILING_OR_ECONOMIC_NOTES: "Do not fabricate a dollar ceiling; long-term ceiling may improve only with collector/institutional validation",
    RIGHTS_REFERENCE_CONSTRAINTS: "Can reduce direct likeness dependence if symbolic or partial subject choices are used",
    SHORT_PATH_VALUE: "Not as immediate as pure flagship graphite, but best bridge toward long-term authority",
    COMPOUNDING_ASSET_VALUE: "High if the series creates recognizable visual territory beyond individual subjects",
    BRAND_CONFUSION_RISK: "Medium-low if executed with restraint; high if symbolism becomes vague or decorative",
    CONFIDENCE: "MEDIUM",
    CRITICAL_UNKNOWNS: ["Which symbolic language is ownable", "Whether collectors reward conceptual complexity"],
    SUCCESS_CRITERIA: [
      "Viewers can describe the visual mechanism without prompting",
      "Serious feedback references authorship, not just likeness",
      "At least one work opens institutional or curatorial conversation"
    ],
    WHAT_WOULD_CHANGE_THE_RECOMMENDATION: [
      "Symbolic works confuse the brand or underperform pure graphite with serious collectors",
      "A coherent visual grammar emerges quickly across studies",
      "Institutional signals favor the conceptual extension"
    ],
    STAGE: "DEVELOP_NEXT",
    evidenceIds: ["evidence-surrealism-market-strength", "evidence-works-on-paper-collector-category"],
    decisionNotes: ["Long-term prestige and differentiation can outrank a more popular current-demand medium"]
  },
  {
    DIRECTION_ID: "cdv1-signature-relief-sculpture-translation",
    MEDIUM: "Sculpture or shallow relief translating a signature graphite mechanism",
    MATERIALS: ["cast resin or bronze study", "graphite-toned surface treatment", "archival base", "optional wall-mounted relief substrate"],
    SIZE_SCALE: "Small maquette to wall relief first; larger sculpture only after collector and fabrication proof",
    SUBJECT_OR_NON_SUBJECT: "Fragment, gesture, equipment, or symbolic mechanism rather than full likeness",
    COMPOSITION: "Signature focal mechanism lifted into physical depth while preserving frontal iconic read",
    PALETTE_COLOR_LOGIC: "Graphite/charcoal tonal family; material finish carries value rather than color",
    LIGHTING: "Installation lighting creates shadow as part of the work",
    DETAIL_EDGE_TREATMENT: "Selective high-detail relief surfaces contrasted with raw or softened planes",
    NEGATIVE_SPACE: "Physical voids and cast shadows become negative space",
    FIGURATION_ABSTRACTION_SURREAL_HYBRID: "Relief hybrid: recognizable fragment plus abstraction through depth",
    PHYSICAL_DEPTH_OR_RELIEF: "Primary experiment; shallow relief before freestanding sculpture",
    SERIES_STRUCTURE: "Three maquette studies, then one collector-facing prototype if quality clears threshold",
    DISPLAY_INSTALLATION: "Wall-mounted object with controlled light; no public commitment before fabrication proof",
    TARGET_COLLECTOR_OR_INSTITUTION: "Collectors already interested in objecthood, design adjacency, and physical rarity",
    CURRENT_MARKET_SIGNAL: "Sculpture remains a major physical medium, but the evidence does not remove production and brand risks",
    LONG_TERM_PRESTIGE_SIGNAL: "Potentially meaningful if it creates object authority without abandoning graphite mastery",
    DIFFERENTIATION: "Medium-high if tied to a signature mechanism; low if it becomes generic portrait sculpture",
    KEEGAN_BRAND_FIT: "Promising but unproven; must translate graphite authority rather than compete with it",
    LEARNING_CURVE: "High; fabrication, finish, edition logic, and installation quality are new constraints",
    CAPACITY_COST: "High cost and vendor/process risk; no material purchases or commitments in this slice",
    PRICE_CEILING_OR_ECONOMIC_NOTES: "Do not infer sculpture price ceiling from category strength; economics require fabrication and collector proof",
    RIGHTS_REFERENCE_CONSTRAINTS: "Can reduce likeness risk through fragments, but recognizable iconography still needs review",
    SHORT_PATH_VALUE: "Low-to-medium until maquette proof exists",
    COMPOUNDING_ASSET_VALUE: "High option value if it becomes a scarce object line, but only after controlled development",
    BRAND_CONFUSION_RISK: "Medium-high if launched before the visual mechanism is unmistakably Keegan",
    CONFIDENCE: "LOW",
    CRITICAL_UNKNOWNS: ["Fabrication partner quality", "Collector willingness to follow Keegan into object work", "Edition and conservation implications"],
    SUCCESS_CRITERIA: [
      "Maquette reads as Keegan without explanatory text",
      "Fabrication quality matches graphite standard",
      "Collector feedback values objecthood and not novelty"
    ],
    WHAT_WOULD_CHANGE_THE_RECOMMENDATION: [
      "A low-cost maquette produces unusually strong collector response",
      "Fabrication quality cannot meet brand standard",
      "A partner/institution creates a credible, controlled object opportunity"
    ],
    STAGE: "DEFER",
    evidenceIds: ["evidence-auction-category-sculpture"],
    decisionNotes: ["Sculpture category strength is real but cannot override capacity cost and unproven brand translation"]
  },
  {
    DIRECTION_ID: "cdv1-physical-authored-moving-image-extension",
    MEDIUM: "Digital/physical or moving-image extension anchored by a collectible physical work",
    MATERIALS: ["finished graphite work", "archival print/process documentation", "time-based digital file", "collector certificate tied to physical authorship"],
    SIZE_SCALE: "Physical anchor remains medium-to-large; digital extension is editioned or access-controlled after proof",
    SUBJECT_OR_NON_SUBJECT: "Same subject thesis as the physical work, extended through motion, process, or reveal",
    COMPOSITION: "Digital layer reveals construction, atmosphere, or time without replacing the finished object",
    PALETTE_COLOR_LOGIC: "Digital color restrained to light, motion, or metadata layer; physical work remains graphite-led",
    LIGHTING: "Moving light or process reveal may extend the lighting concept",
    DETAIL_EDGE_TREATMENT: "Physical detail remains authoritative; digital edge treatment supports narrative rhythm",
    NEGATIVE_SPACE: "Negative space can become timed silence, fade, or reveal",
    FIGURATION_ABSTRACTION_SURREAL_HYBRID: "Physical figuration plus digital atmospheric or process abstraction",
    PHYSICAL_DEPTH_OR_RELIEF: "Physical authorship is required; digital-only output is avoided in V1",
    SERIES_STRUCTURE: "One physical flagship with one controlled digital companion, not an open-ended content stream",
    DISPLAY_INSTALLATION: "Private collector viewing or controlled screen companion; avoid platform-dependent spectacle",
    TARGET_COLLECTOR_OR_INSTITUTION: "Younger collectors and digital-curious institutions who still require physical scarcity",
    CURRENT_MARKET_SIGNAL: "Digital participation among younger collectors has expanded, but physical authorship remains the brand anchor",
    LONG_TERM_PRESTIGE_SIGNAL: "Potential if used as provenance, process, or installation language rather than speculative digital product",
    DIFFERENTIATION: "Medium if it reveals craft in a way still impossible to counterfeit emotionally",
    KEEGAN_BRAND_FIT: "Conditional: strong as companion authorship, weak as standalone digital output",
    LEARNING_CURVE: "Medium-high; requires motion language, edition policy, and rights/platform discipline",
    CAPACITY_COST: "Medium-to-high; production partner or tooling may be needed later, with approval before commitments",
    PRICE_CEILING_OR_ECONOMIC_NOTES: "No dollar ceiling; collector value must be proven as physical-plus-digital authorship, not digital hype",
    RIGHTS_REFERENCE_CONSTRAINTS: "Reference and music/motion asset rights must be clean before any public release",
    SHORT_PATH_VALUE: "Medium as a controlled storytelling experiment, not a core medium pivot",
    COMPOUNDING_ASSET_VALUE: "Medium-high if it improves provenance, collector experience, and institutional display options",
    BRAND_CONFUSION_RISK: "High if it looks like content marketing or NFT-era speculation rather than fine-art authorship",
    CONFIDENCE: "LOW",
    CRITICAL_UNKNOWNS: ["Collector willingness to pay for companion authorship", "Rights path for moving imagery", "Best installation format"],
    SUCCESS_CRITERIA: [
      "The physical work remains the primary collectible object",
      "The digital layer increases perceived authorship and provenance",
      "Younger collector interest increases without diluting premium positioning"
    ],
    WHAT_WOULD_CHANGE_THE_RECOMMENDATION: [
      "A collector or institution asks for controlled physical-plus-digital display",
      "Digital layer distracts from or cheapens the graphite object",
      "Rights or platform dependency becomes too risky"
    ],
    STAGE: "AVOID",
    evidenceIds: ["evidence-younger-collector-digital-expansion", "evidence-direct-from-artist-expanded"],
    decisionNotes: ["Avoid standalone digital pivot; preserve optionality through physical authorship"]
  }
];

export const creativeDirectionRoadmapFixture: CreativeDirectionRoadmap = {
  generatedAt: "2026-08-17T12:00:00.000Z",
  dataMode: "FIXTURE_BASELINE",
  evidence: creativeDirectionEvidenceFixtures,
  directions: creativeDirectionCandidateFixtures,
  stageOrder: ["KEEP_NOW", "TEST_NOW", "DEVELOP_NEXT", "DEFER", "AVOID"],
  dashboard: {
    question: "WHAT SHOULD I MAKE NEXT?",
    currentRecommendation:
      "Keep the flagship hyperreal graphite evolution as the immediate creative path; test one restrained material/color intervention and develop surreal symbolic graphite language next.",
    mediumRoadmap: [
      { stage: "KEEP_NOW", directionIds: ["cdv1-graphite-flagship-evolution"], label: "Protect and elevate the core graphite authority" },
      { stage: "TEST_NOW", directionIds: ["cdv1-graphite-selective-material-color"], label: "Run a controlled intervention test" },
      { stage: "DEVELOP_NEXT", directionIds: ["cdv1-graphite-surreal-symbolic-environment"], label: "Build proprietary visual language" },
      { stage: "DEFER", directionIds: ["cdv1-signature-relief-sculpture-translation"], label: "Hold object work until maquette proof" },
      { stage: "AVOID", directionIds: ["cdv1-physical-authored-moving-image-extension"], label: "Avoid standalone digital pivot; retain companion optionality" }
    ],
    caveats: [
      "Current demand and long-term prestige are separate evidence classes",
      "Dollar claims remain unknown unless first-party or market evidence supports them",
      "No production, materials, pricing, or public commitments are authorized by this fixture"
    ]
  }
};
