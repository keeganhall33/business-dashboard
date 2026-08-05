import test from "node:test";
import assert from "node:assert/strict";

import { loadProductionSourceRegistryV1 } from "@/lib/external-intelligence/config/load-production-source-registry";

test("production source registry: all 24 canonical source ids exist exactly once", () => {
  const { file, registry_hash } = loadProductionSourceRegistryV1();

  assert.equal(file.schema_version, "production_source_registry_v1");
  assert.equal(file.fixture_status, "production");
  assert.equal(file.production_eligibility, "enabled");
  assert.match(registry_hash, /^[a-f0-9]{64}$/);

  const ids = file.sources.map((s) => s.source_id);
  assert.equal(ids.length, 24);

  const unique = new Set(ids);
  assert.equal(unique.size, 24);

  const expected = [
    "sports.major_leagues.official",
    "sports.ncaa.official",
    "sports_business.sportico",
    "sports_business.boardroom",
    "sports_business.front_office_sports",
    "calendar.sports.milestones",
    "licensing.uspto.trademarks",
    "licensing.rights_holders.newsrooms",
    "competitors.curated.set",
    "galleries.curated.rosters",
    "platform.meta.policy_updates",
    "platform.google.policy_updates",
    "regulatory.us.releases",
    "ops.shipping.alerts",
    "art_market.sothebys",
    "memorabilia.heritage",
    "trading_cards.psa",
    "trading_cards.card_ladder",
    "search.google_trends",
    "economics.fred",
    "entertainment.deadline",
    "music.pollstar",
    "social.youtube",
    "entertainment.variety"
  ];

  assert.deepEqual(ids.slice().sort(), expected.slice().sort());

  // Fail-closed: production registry must not auto-enable collection.
  for (const s of file.sources) {
    assert.equal(s.enabled_by_default, false);
  }
});
