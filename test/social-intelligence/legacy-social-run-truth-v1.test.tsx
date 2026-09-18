import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const scriptPath = path.resolve(process.cwd(), "scripts/run-social-intelligence.mjs");

function runLegacySocialBridge(options: {
  website?: unknown;
  manualInput?: unknown;
}) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "social-legacy-truth-"));
  const websiteDir = path.join(tempRoot, "dashboard", "data", "website");
  const socialDir = path.join(tempRoot, "dashboard", "data", "social");
  fs.mkdirSync(websiteDir, { recursive: true });
  fs.mkdirSync(socialDir, { recursive: true });

  if (options.website !== undefined) {
    fs.writeFileSync(path.join(websiteDir, "latest.json"), JSON.stringify(options.website));
  }
  if (options.manualInput !== undefined) {
    fs.writeFileSync(path.join(socialDir, "manual_input.json"), JSON.stringify(options.manualInput));
  }

  const env = { ...process.env };
  delete env.NEXT_PUBLIC_SUPABASE_URL;
  delete env.SUPABASE_SERVICE_ROLE_KEY;

  const execution = spawnSync(process.execPath, [scriptPath], {
    cwd: tempRoot,
    env,
    encoding: "utf8"
  });

  const outputPath = path.join(socialDir, "latest.json");
  const output = fs.existsSync(outputPath)
    ? JSON.parse(fs.readFileSync(outputPath, "utf8"))
    : null;

  fs.rmSync(tempRoot, { recursive: true, force: true });
  return { execution, output };
}

test("legacy social bridge cannot convert WooCommerce activity into social-performance evidence", () => {
  const { execution, output } = runLegacySocialBridge({
    website: {
      generatedAt: "2026-09-18T07:00:00Z",
      wooCommerce: {
        recentOrders: [
          {
            customer: "Jane Collector",
            total: "395.00",
            date: "2026-09-18T06:30:00Z"
          }
        ]
      }
    }
  });

  assert.equal(execution.status, 0, execution.stderr);
  assert.equal(output.operationalState, "SCAFFOLDED");
  assert.equal(output.mode, "SCAFFOLDED");
  assert.equal(output.liveFirstPartyData, false);
  assert.equal(output.coverageState, "AVAILABLE_NEEDS_IMPLEMENTATION");
  assert.equal(output.source, "none");
  assert.deepEqual(output.insights, []);
  assert.equal(output.sourceDetails.websiteSnapshotPresent, true);
  assert.equal(output.sourceDetails.websiteDerivedCount, 0);
  assert.equal(output.sourceDetails.websiteDataUsedForSocialMetrics, false);
  assert.equal(output.externalSocialAccessPerformed, false);
  assert.equal(output.platformMutationPerformed, false);
  assert.equal(JSON.stringify(output).includes("Jane Collector"), false);
  assert.equal(JSON.stringify(output).includes("395.00"), false);
  assert.match(output.limitations.join(" "), /commerce activity is not converted into social performance evidence/i);
});

test("manual observations preserve only supplied facts and leave missing interpretation unknown", () => {
  const { execution, output } = runLegacySocialBridge({
    manualInput: [
      {
        observationId: "manual:helmet-progress",
        platform: "Instagram",
        title: "Seahawks throwback helmet WIP",
        format: "Reel",
        date: "2026-09-18T05:00:00-07:00",
        metrics: "Provider screenshot retained outside this legacy bridge",
        status: "review"
      },
      {
        metrics: "Unstructured historical note"
      }
    ]
  });

  assert.equal(execution.status, 0, execution.stderr);
  assert.equal(output.source, "manual_input");
  assert.equal(output.sourceDetails.manualEntryCount, 2);
  assert.equal(output.sourceDetails.normalizedManualEntryCount, 2);
  assert.equal(output.insights.length, 2);

  const first = output.insights[0];
  assert.equal(first.observationId, "manual:helmet-progress");
  assert.equal(first.platform, "Instagram");
  assert.equal(first.title, "Seahawks throwback helmet WIP");
  assert.equal(first.date, "2026-09-18T12:00:00.000Z");
  assert.equal(first.why, null);
  assert.equal(first.nextIdea, null);
  assert.equal(first.confidence, null);
  assert.equal(first.evidenceState, "MANUAL_UNVERIFIED");
  assert.equal(first.liveFirstPartyData, false);
  assert.deepEqual(first.providerEvidenceRefs, []);

  const second = output.insights[1];
  assert.equal(second.platform, null);
  assert.equal(second.title, null);
  assert.equal(second.format, null);
  assert.equal(second.date, null);
  assert.equal(second.why, null);
  assert.equal(second.nextIdea, null);
  assert.equal(second.confidence, null);
  assert.equal(second.source, "manual_input");
  assert.equal(second.evidenceState, "MANUAL_UNVERIFIED");
});
