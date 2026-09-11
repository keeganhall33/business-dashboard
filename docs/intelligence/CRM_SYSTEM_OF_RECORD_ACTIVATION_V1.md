# CRM System of Record Activation V1

Status: P0 execution contract
Parent: #316

## Objective
Make the native Relationships / CRM workspace the durable business system of record for Keegan Hall's people, companies, opportunities, relationship edges, touchpoints, follow-ups, notes, and IONOS-derived communication history.

The CRM must no longer depend on ChatGPT conversation memory, ad hoc reminders, or fixture-only projections for important business relationship state.

## Product invariant
When Keegan reports a material business touchpoint such as "I emailed Michelle at the Mercedes Masters agency," the system must be able to persist that activity against canonical person, company, relationship, and opportunity records, update the opportunity state, and schedule or expose the next follow-up without inventing inbox status.

Chat memory may provide temporary context, but it is never the durable system of record.

## Existing foundation to reuse
Do not create a parallel CRM. Reuse the existing work under #316 and the current Relationships / CRM and IONOS contracts, including People and Companies directories, person/company detail workspaces, opportunity detail workspaces, CRM activity timeline, IONOS normalization/deduplication, IONOS to CRM identity/activity linking, relationship-state intelligence, intelligent inbox / attention queues, bounded historical IONOS candidate scanning, and existing Supabase/canonical application persistence boundaries.

## P0 activation sequence

### 1. Canonical persistent CRM records
Implement or connect the canonical durable store for Person, Company / Organization, Opportunity, RelationshipEdge, Activity / Touchpoint, FollowUp / Task, Note, source/evidence provenance, and external identity aliases needed for entity resolution.

Every material record must have stable IDs, created/updated timestamps, provenance, and an evidence/truth state where applicable.

### 2. Production loaders
Replace fail-closed empty production CRM loaders with evidence-backed canonical loaders. Existing empty-state behavior remains the fallback when the store genuinely has no records or the source is unavailable.

People, Companies, person detail, company detail, opportunity detail, and activity timeline must read the same canonical records.

### 3. Manual capture/write path
Add a safe internal write path for explicitly user-supplied business facts and touchpoints so approved internal tools can record person/company creation or update, opportunity creation/update, relationship edge, outbound/inbound/manual touchpoint, next follow-up date, opportunity stage/state, and note.

The write path must be idempotent, auditable, and must not send any external communication.

### 4. IONOS historical backfill
Use the existing three-mailbox read-only IONOS pipeline to perform bounded historical ingestion into canonical CRM activity and entity-resolution candidates.

Requirements:
- preserve source mailbox identity and provenance
- deduplicate cross-folder / cross-mailbox copies
- do not infer a reply unless direct message evidence proves it
- do not equate marketing opens/clicks with direct human correspondence
- ambiguous identities remain review candidates
- historical scanning is resumable and bounded
- no mailbox mutation and no SMTP/send

### 5. Entity resolution and review
Resolve email identities and historical contacts into canonical People/Companies using evidence-safe rules. Ambiguous merges must fail closed into a review queue.

One human/company should not become multiple CRM records merely because they appear under multiple mailbox threads, aliases, or spelling variations.

### 6. Opportunity extraction / stale-opportunity recovery
Historical email evidence may produce OpportunityCandidate records for review when it indicates a potentially material business opportunity, introduction, commission, corporate art inquiry, partnership, licensing discussion, sponsorship, collector relationship, media opportunity, or promised future reconnect.

Candidate extraction must not silently promote uncertain evidence into a live opportunity. Human-confirmed or sufficiently governed evidence is required for canonical promotion.

### 7. Relationship graph
Expose canonical edges across Person <-> Company, Person <-> Person, Company <-> Company, Person/Company <-> Opportunity, Person/Company <-> Project / Artwork / Event where existing canonical entities exist, and introduction / warm-path provenance.

The graph must preserve evidence/provenance and UNKNOWN rather than manufacturing relationship strength.

### 8. Follow-up operating queues
At minimum support reliable views for Needs reply, Waiting on contact, Follow up this week, Overdue follow-up, Stale opportunity, High-value active opportunity, Recently re-engaged, and Requires verification / ambiguous identity.

Inbox state remains UNKNOWN unless direct IONOS evidence or another connected source proves it.

### 9. Initial business backfill
Once canonical persistence and loaders exist, populate the first governed high-value active relationship/opportunity set from already supplied business context, without inventing private facts. Include current material relationships such as Mercedes/Masters, Arena Club, Pentel, University of Washington football, Naismith Basketball Hall of Fame, Armada Design & Build, Strathmore, Fanatics, Upper Deck / Michael Jordan, Alabama football, and other confirmed current opportunities in the existing business context.

Each record should capture only supported facts: relationship state, last known touchpoint, next action, next review date, owner, source/provenance, and uncertainty.

### 10. Continuous ingestion
After historical backfill is proven, enable bounded recurring read-only IONOS ingestion so new correspondence updates the same canonical CRM records and queues instead of requiring manual rescans.

Scheduling must use the existing canonical scheduler architecture and expose health/freshness evidence.

## Mercedes acceptance scenario
The current Mercedes / Masters relationship is the first end-to-end acceptance fixture using only user-provided facts.

The system must support canonical records representing Michelle Bevilacqua as a Person, Public School as her agency/company, Mercedes-Benz as the brand/client relationship context, Melody Lee as the Mercedes referral path, Mercedes-Benz Masters collaboration as an Opportunity, September 11, 2026 outbound follow-up as an Activity, opportunity state = WAITING_ON_CONTACT unless later direct evidence proves otherwise, and next review/follow-up = September 22, 2026.

Concept notes may include original artwork, limited collectible for guests/partners, or broader Masters activation, explicitly as Keegan-provided proposal context rather than Mercedes commitment.

No claim of reply, meeting, budget, approval, or Mercedes commitment may be stored without evidence.

## Product UX acceptance
A user opening Relationships / CRM must be able to find a person or company, open the canonical detail record, see related opportunities and relationship paths, see chronological touchpoints across supported sources, see the next follow-up / owner / state, open the related opportunity detail workspace, understand source and confidence/provenance, distinguish waiting-on-them from needs-reply and UNKNOWN, see relationship graph context where supported, and update a manual touchpoint without leaving the CRM.

## Truth and safety gates
- IONOS is the work-email provider. Do not assume Gmail inbox coverage.
- No claim that someone replied unless direct source evidence proves it.
- No SMTP/send or automatic outreach in this activation lane.
- No mailbox mutation.
- No invented contacts, relationships, introductions, opportunities, values, stages, or follow-up outcomes.
- UNKNOWN is distinct from NONE.
- ChatGPT conversation context is not durable CRM persistence.
- Fixture data must never masquerade as production evidence.
- Do not create a second CRM store if an existing canonical data boundary can be extended.

## Definition of done
This lane is not done because CRM pages render.

DONE requires canonical durable CRM persistence used by production loaders; People/Companies/detail/activity/opportunity surfaces reading real canonical records; explicit manual business touchpoints being writable and audited; the Mercedes acceptance scenario visible from the live CRM store; bounded historical IONOS backfill populating canonical activity/entity candidates; ambiguous identity handling failing closed; at least one stale/forgotten historical opportunity candidate surfaced from real bounded evidence without fabricated facts; follow-up queues deriving from canonical state; relationship edges queryable and visible in the CRM experience; continuous read-only IONOS ingestion having a proven scheduler/health path or an explicit remaining activation gate; exact-head tests and production verification passing; and no external message sent as part of this work.
