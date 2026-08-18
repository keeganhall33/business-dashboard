import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { buildOvernightReport } from "../scripts/orchestration-v3/overnight-report.mjs";

const root = process.cwd();

function read(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function heartbeat(date: string, time: string, epochMs: number) {
  return {
    event: "HEARTBEAT",
    generated_at: new Date(epochMs).toISOString(),
    epoch_ms: epochMs,
    pacific_date: date,
    pacific_time: time,
    watcher_alive: true,
    idle_sleep_guard: { enabled: true, alive: true },
    active_worker_count: 0,
    active_workers: []
  };
}

test("V3 host uses process-scoped macOS idle-sleep prevention without wrapping watcher identity", () => {
  const host = read("scripts/orchestration-v3/watcher-host.mjs");
  const activation = read("scripts/orchestration-v3/activate-host.mjs");

  assert.match(host, /\/usr\/bin\/caffeinate/);
  assert.match(host, /\["-i", "-w", String\(watcherPid\)\]/);
  assert.match(host, /process\.platform !== "darwin"/);
  assert.match(activation, /watcher-host\.mjs/);
  assert.doesNotMatch(activation, /<string>\/usr\/bin\/caffeinate<\/string>/);
});

test("overnight report proves a healthy quiet queue when heartbeats are continuous", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "v3-overnight-"));
  const file = path.join(dir, "heartbeats.ndjson");
  const rows = [];
  let epoch = Date.parse("2026-08-18T05:00:00Z");

  for (let minute = 22 * 60; minute <= 24 * 60 + 7 * 60; minute += 4) {
    const nextDay = minute >= 1440;
    const localMinute = nextDay ? minute - 1440 : minute;
    const hour = String(Math.floor(localMinute / 60)).padStart(2, "0");
    const min = String(localMinute % 60).padStart(2, "0");
    rows.push(heartbeat(nextDay ? "2026-08-19" : "2026-08-18", `${hour}:${min}:00`, epoch));
    epoch += 4 * 60_000;
  }

  fs.writeFileSync(file, rows.map((row) => JSON.stringify(row)).join("\n") + "\n");
  const report = buildOvernightReport({ nightDate: "2026-08-18", maxGapMinutes: 5, filePath: file });

  assert.equal(report.continuity, "CONTINUOUS");
  assert.equal(report.gaps.length, 0);
  assert.match(report.interpretation, /healthy quiet queue/i);
});

test("overnight report flags a sleep-sized heartbeat gap", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "v3-overnight-gap-"));
  const file = path.join(dir, "heartbeats.ndjson");
  const rows = [
    heartbeat("2026-08-18", "22:00:00", 1_000_000),
    heartbeat("2026-08-18", "22:04:00", 1_240_000),
    heartbeat("2026-08-19", "02:30:00", 17_200_000),
    heartbeat("2026-08-19", "06:59:00", 33_340_000)
  ];
  fs.writeFileSync(file, rows.map((row) => JSON.stringify(row)).join("\n") + "\n");

  const report = buildOvernightReport({ nightDate: "2026-08-18", maxGapMinutes: 5, filePath: file });
  assert.equal(report.continuity, "INTERRUPTED_OR_UNPROVEN");
  assert.ok(report.gaps.some((gap: { kind: string; minutes?: number }) => gap.kind === "HEARTBEAT_GAP" && Number(gap.minutes) > 200));
});
