import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import React from "react";
import { renderToString } from "react-dom/server";

import { SocialConnectorHealthPanelV1 } from "@/components/data-evidence/SocialConnectorHealthPanelV1";
import type { DashboardSnapshotRecord } from "@/lib/supabase/queries";
import {
  buildUnavailableSocialConnectorHealthSurfaceV1,
  projectSocialConnectorHealthSurfaceV1
} from "@/lib/social-intelligence/load-social-connector-health-v1";
import type { SocialPlatformV1 } from "@/lib/social-intelligence/social-canonical-v1";
import type { SocialPlatformConnectorInputV1 } from "@/lib/social-intelligence/social-connector-proof-v1";

const NOW = "2026-09-19T12:00:00.000Z";
const ROUTE_PATH = "src/app/(app)/data-evidence/page.tsx";

function snapshot(key: string, payload: unknown): DashboardSnapshotRecord {
  return { key, payload, mode: null, generated_at: NOW, updated_at: NOW };
}

function connector(platform: SocialPlatformV1): SocialPlatformConnectorInputV1 {
  if (platform === "INSTAGRAM") {
    return {
      platform,
      connectorId: "meta-graph-instagram",
      availability: "AVAILABLE",
      authorizationState: "AUTHORIZED",
      implementationState: "NOT_IMPLEMENTED",
      sourceKind: "OFFICIAL_API",
      readOnly: true,
      historicalBackfill: "LIMITED"
    };
  }
  return {
    platform,
    connectorId: `${platform.toLowerCase()}-unavailable`,
    availability: "UNAVAILABLE",
    authorizationState: "NOT_APPLICABLE",
    implementationState: "NOT_IMPLEMENTED",
    sourceKind: null,
    readOnly: true,
    historicalBackfill: "UNKNOWN"
  };
}

test("legacy scaffold is visible as unproven without inventing platform metrics", () => {
  const surface = projectSocialConnectorHealthSurfaceV1([
    snapshot("social", {
      generatedAt: NOW,
      mode: "SCAFFOLDED",
      liveFirstPartyData: false,
      externalSocialAccessPerformed: false
    })
  ], NOW);
  const html = renderToString(<SocialConnectorHealthPanelV1 surface={surface} />);

  assert.equal(surface.state, "UNPROVEN");
  assert.equal(surface.review, null);
  assert.match(html, /Social intelligence/);
  assert.match(html, /Live first-party social performance is not yet proven/);
  assert.match(html, /No platform metrics are shown until live first-party proof passes validation/);
  assert.doesNotMatch(html, /Instagram|Facebook|TikTok/);
});

test("validated connector input bundle produces explicit platform health", () => {
  const platforms: SocialPlatformV1[] = ["INSTAGRAM", "FACEBOOK", "YOUTUBE", "TIKTOK", "X", "THREADS", "LINKEDIN"];
  const surface = projectSocialConnectorHealthSurfaceV1([
    snapshot("social_connector_health_v1", {
      generatedAt: NOW,
      connectorInputs: platforms.map(connector),
      providerRunInputs: []
    })
  ], NOW);
  const html = renderToString(<SocialConnectorHealthPanelV1 surface={surface} />);

  assert.equal(surface.state, "PROVEN");
  assert.equal(surface.review?.platforms.length, 7);
  assert.deepEqual(surface.review?.platformsNeedingEngineeringAction, ["INSTAGRAM"]);
  assert.match(html, /Platforms reviewed/);
  assert.match(html, /Instagram/);
  assert.match(html, /Engineering follow-up required/);
  assert.match(html, /Facebook/);
  assert.doesNotMatch(html, /audience|reach|views/i);
});

test("invalid proof bundle is withheld instead of partially rendered", () => {
  const surface = projectSocialConnectorHealthSurfaceV1([
    snapshot("social_connector_health_v1", {
      generatedAt: NOW,
      connectorInputs: [],
      providerRunInputs: []
    })
  ], NOW);

  assert.equal(surface.state, "UNAVAILABLE");
  assert.equal(surface.review, null);
  assert.match(surface.summary, /could not be validated/);
  assert.match(surface.detail, /withheld platform claims/);
});

test("missing snapshots return a fixed unavailable state", () => {
  assert.deepEqual(projectSocialConnectorHealthSurfaceV1([], NOW), buildUnavailableSocialConnectorHealthSurfaceV1());
});

test("data status loads commerce and social health independently without a waterfall", () => {
  const source = fs.readFileSync(ROUTE_PATH, "utf8");
  assert.match(source, /Promise\.allSettled\(\[/);
  assert.match(source, /loadExecutiveDataEvidenceViewV1\(\)/);
  assert.match(source, /loadSocialConnectorHealthSurfaceV1\(\)/);
  assert.match(source, /socialConnectorHealth=\{socialConnectorHealth\}/);
});
