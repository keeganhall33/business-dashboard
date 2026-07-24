import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
import { AgentKpiStrip } from "@/components/dashboard/AgentKpiStrip";
import type { AgentKpiBucket } from "@/lib/types/dashboard";

const sampleBuckets: AgentKpiBucket[] = [
  {
    agentKey: "avery",
    agentName: "Avery",
    kpis: [
      {
        kpiKey: "revenue",
        kpiName: "Revenue",
        latestReading: { value: 12500, measuredAt: "2026-07-20T00:00:00Z" },
        priorReading: { value: 10000, measuredAt: "2026-07-13T00:00:00Z" },
        targetValue: 20000,
        unit: "usd",
        frequency: "weekly"
      },
      {
        kpiKey: "orders",
        kpiName: "Orders",
        latestReading: { value: 42, measuredAt: "2026-07-20T00:00:00Z" },
        priorReading: { value: 38, measuredAt: "2026-07-13T00:00:00Z" },
        targetValue: 60,
        unit: "count",
        frequency: "weekly"
      },
      {
        kpiKey: "conversion",
        kpiName: "Conversion",
        latestReading: { value: 2.4, measuredAt: "2026-07-20T00:00:00Z" },
        priorReading: { value: 2.1, measuredAt: "2026-07-13T00:00:00Z" },
        targetValue: 3.0,
        unit: "percent",
        frequency: "weekly"
      }
    ]
  }
];

function renderDenseStrip() {
  let renderer: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<AgentKpiStrip dense items={sampleBuckets} />);
  });
  return renderer!;
}

test("dense mode renders only the top two KPI metrics", () => {
  const renderer = renderDenseStrip();
  const metrics = renderer.root.findAll((node) => node.props?.["data-testid"] === "agent-kpi-dense-metric");
  assert.equal(metrics.length, 2);
});

export {};
