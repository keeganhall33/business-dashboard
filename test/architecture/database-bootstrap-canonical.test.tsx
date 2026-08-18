import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

function read(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function exists(relativePath: string) {
  return fs.existsSync(path.join(root, relativePath));
}

function schemaSeedSection() {
  const schema = read("supabase/schema.sql");
  const marker = "-- 5. SEEDS";
  const start = schema.indexOf(marker);
  assert.ok(start > -1, "schema.sql must include seed section");
  return schema.slice(start);
}

test("fresh bootstrap uses canonical agent operating model metadata", () => {
  const seeds = schemaSeedSection();

  assert.match(seeds, /'avery','Avery','Executive Strategy & Chief of Staff'/);
  assert.match(seeds, /'sloan','Sloan','Revenue & Commerce Intelligence'/);
  assert.match(seeds, /'lyra','Lyra','Brand, Audience & Cultural Intelligence'/);
  assert.match(seeds, /'noah','Noah','External Intelligence, Relationships & Opportunities'/);

  for (const legacy of [
    "Executive Operator",
    "Head of Product & Ecommerce",
    "Head of Brand & Narrative",
    "Head of Partnerships & Research"
  ]) {
    assert.doesNotMatch(seeds, new RegExp(legacy.replaceAll("&", "\\&")));
  }
});

test("fresh bootstrap cannot reactivate legacy strategy metric rules", () => {
  const seeds = schemaSeedSection();
  const metricRuleTuples = seeds.matchAll(/\('[^']+','[<>]=?',(?:\d+(?:\.\d+)?),'[^']+','[^']+','[^']+',(?<active>true|false)\)/g);
  const activeFlags = [...metricRuleTuples].map((match) => match.groups?.active);

  assert.ok(activeFlags.length >= 1, "expected metric alert rule seed tuples");
  assert.deepEqual(new Set(activeFlags), new Set(["false"]));
  assert.doesNotMatch(seeds, /Design premium pricing architecture|Audit homepage\/PDP\/checkout friction|Run a prestige-target research sprint/);
});

test("fresh bootstrap and runtime do not recreate daily idea quota autonomy", () => {
  const schema = read("supabase/schema.sql");
  const sharedAgentRuntime = read("src/lib/agents/shared.ts");
  const dailyHealthCheck = read("src/lib/scheduler/dailyHealthCheck.ts");
  const eveningCloseout = read("src/lib/scheduler/eveningCloseout.ts");
  const schedulerIndex = read("src/lib/scheduler/index.ts");
  const retireMigration = read("supabase/migrations/20260818110000_retire_daily_idea_quota_v1.sql");

  assert.doesNotMatch(schema, /create\s+or\s+replace\s+view\s+agent_daily_idea_quota/i);
  assert.match(retireMigration, /drop view if exists public\.agent_daily_idea_quota/i);
  assert.equal(exists("src/lib/scheduler/ideaQuota.ts"), false);

  for (const source of [sharedAgentRuntime, dailyHealthCheck, eveningCloseout, schedulerIndex]) {
    assert.doesNotMatch(source, /ideaQuota|IdeaQuota|agent_daily_idea_quota|Missing idea quota|quota-driven ideas created/);
  }

  assert.doesNotMatch(sharedAgentRuntime, /createAgentIdea|fallbackIdeaTitle|Autologged idea to satisfy daily quota/);
});

test("idea board remains a human-managed product surface, not a quota engine", () => {
  const docs = read("docs/runbooks/database-bootstrap.md");
  const schema = read("supabase/schema.sql");
  const ideaApi = read("src/app/api/ideas/route.ts");

  assert.match(schema, /create table if not exists agent_ideas/i);
  assert.match(ideaApi, /export async function POST/);
  assert.match(docs, /`agent_ideas` remains a distinct, human-managed product surface/i);
  assert.match(docs, /Fresh environments should be created by replaying `supabase\/migrations` in order/i);
});
