import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import React from "react";
import { renderToString } from "react-dom/server";

import { ExecutiveCommandCenter } from "@/components/executive-home/ExecutiveCommandCenter";
import { ExecutiveHomeShell } from "@/components/executive-home/ExecutiveHomeShell";
import { EXECUTIVE_HOME_FIXTURE_V1 } from "@/lib/executive-home/fixtures";

const commandCenterSource = readFileSync("src/components/executive-home/ExecutiveCommandCenter.tsx", "utf8");
const shellSource = readFileSync("src/components/executive-home/ExecutiveHomeShell.tsx", "utf8");
const drilldownSource = readFileSync("src/lib/executive-home/decision-room-drilldown.ts", "utf8");

function runtimeModuleImports(source: string): string[] {
  const pattern = /(?:^|\n)\s*(?:import|export)\s+(?!type\b)[^;]*?\sfrom\s*["']([^"']+)["']\s*;?/g;

  return [...source.matchAll(pattern)].map((match) => match[1]);
}

test("Executive Home production modules do not import fixture providers at runtime", () => {
  for (const source of [commandCenterSource, shellSource, drilldownSource]) {
    assert.equal(runtimeModuleImports(source).some((modulePath) => modulePath.endsWith("/fixtures")), false);
  }
  assert.doesNotMatch(commandCenterSource, /data\s*===\s*EXECUTIVE_HOME_FIXTURE/);
  assert.doesNotMatch(shellSource, /decisionRoom\s*=\s*EXECUTIVE_HOME_DECISION_ROOM_DRILLDOWN_FIXTURE/);
});

test("Executive Home withholds drilldown and strategy mutation without explicit canonical inputs", () => {
  const shellHtml = renderToString(<ExecutiveHomeShell data={EXECUTIVE_HOME_FIXTURE_V1} />);
  const commandCenterHtml = renderToString(<ExecutiveCommandCenter data={EXECUTIVE_HOME_FIXTURE_V1.command_center} />);

  assert.match(shellHtml, /Decision Room evidence is unavailable/);
  assert.match(shellHtml, /Decision evidence UNKNOWN/);
  assert.match(shellHtml, /UNAVAILABLE/);
  assert.doesNotMatch(shellHtml, /Jump to grounded drill-down|Open Decision Room/);
  assert.match(commandCenterHtml, /Mark current step complete/);
  assert.match(commandCenterHtml, /disabled/);
  assert.match(commandCenterHtml, /Specialist evidence unavailable/);
});
