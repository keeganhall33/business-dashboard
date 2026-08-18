import fs from "node:fs";
import path from "node:path";
import { ORCHESTRATION_V3 } from "./config.mjs";

function arg(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 && index + 1 < process.argv.length ? process.argv[index + 1] : fallback;
}

function pacificParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour")}:${get("minute")}:${get("second")}`,
    hour: Number(get("hour"))
  };
}

function shiftDate(isoDate, days) {
  const value = new Date(`${isoDate}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function inferNightDate() {
  const now = pacificParts();
  return now.hour >= 22 ? now.date : shiftDate(now.date, -1);
}

function minuteOfDay(time) {
  const [hour, minute] = String(time ?? "00:00").split(":").map(Number);
  return hour * 60 + minute;
}

function localMinuteIndex(record, nightDate, nextDate) {
  if (record.pacific_date === nightDate) return minuteOfDay(record.pacific_time);
  if (record.pacific_date === nextDate) return 1440 + minuteOfDay(record.pacific_time);
  return null;
}

function readHeartbeats(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try { return JSON.parse(line); } catch { return null; }
    })
    .filter(Boolean);
}

export function buildOvernightReport({ nightDate = inferNightDate(), maxGapMinutes = 5, filePath = null } = {}) {
  const nextDate = shiftDate(nightDate, 1);
  const heartbeatFile = filePath ?? path.join(ORCHESTRATION_V3.runtime.stateRoot, "health", "watcher-heartbeats.ndjson");
  const startMinute = 22 * 60;
  const endMinute = 24 * 60 + 7 * 60;
  const rows = readHeartbeats(heartbeatFile)
    .map((record) => ({ record, localMinute: localMinuteIndex(record, nightDate, nextDate) }))
    .filter(({ localMinute }) => Number.isFinite(localMinute) && localMinute >= startMinute && localMinute <= endMinute)
    .sort((a, b) => Number(a.record.epoch_ms) - Number(b.record.epoch_ms));

  const gaps = [];
  if (rows.length === 0) {
    gaps.push({ kind: "NO_HEARTBEATS", minutes: endMinute - startMinute });
  } else {
    const firstBoundaryGap = rows[0].localMinute - startMinute;
    if (firstBoundaryGap > maxGapMinutes) gaps.push({ kind: "WINDOW_START", minutes: firstBoundaryGap });

    for (let index = 1; index < rows.length; index += 1) {
      const previous = rows[index - 1].record;
      const current = rows[index].record;
      const minutes = (Number(current.epoch_ms) - Number(previous.epoch_ms)) / 60_000;
      if (minutes > maxGapMinutes) {
        gaps.push({
          kind: "HEARTBEAT_GAP",
          minutes: Number(minutes.toFixed(2)),
          from: previous.generated_at,
          to: current.generated_at,
          from_pacific: `${previous.pacific_date} ${previous.pacific_time}`,
          to_pacific: `${current.pacific_date} ${current.pacific_time}`
        });
      }
    }

    const lastBoundaryGap = endMinute - rows[rows.length - 1].localMinute;
    if (lastBoundaryGap > maxGapMinutes) gaps.push({ kind: "WINDOW_END", minutes: lastBoundaryGap });
  }

  const watcherDown = rows.filter(({ record }) => record.watcher_alive === false).length;
  const guardFailures = rows.filter(({ record }) => record.idle_sleep_guard?.enabled && record.idle_sleep_guard?.alive === false).length;
  const activeSamples = rows.filter(({ record }) => Number(record.active_worker_count) > 0).length;
  const uniqueIssues = [...new Set(rows.flatMap(({ record }) => (record.active_workers ?? []).map((worker) => worker.issue_number)).filter(Boolean))];

  return {
    generated_at: new Date().toISOString(),
    night_date_pacific: nightDate,
    window: `${nightDate} 22:00 -> ${nextDate} 07:00 America/Los_Angeles`,
    heartbeat_file: heartbeatFile,
    sample_count: rows.length,
    max_allowed_gap_minutes: maxGapMinutes,
    continuity: gaps.length === 0 && watcherDown === 0 && guardFailures === 0 ? "CONTINUOUS" : "INTERRUPTED_OR_UNPROVEN",
    watcher_down_samples: watcherDown,
    idle_sleep_guard_failure_samples: guardFailures,
    active_worker_samples: activeSamples,
    unique_issue_numbers_seen: uniqueIssues,
    gaps,
    first_heartbeat: rows[0]?.record?.generated_at ?? null,
    last_heartbeat: rows.at(-1)?.record?.generated_at ?? null,
    interpretation: rows.length === 0
      ? "No V3 heartbeat evidence exists for this overnight window."
      : activeSamples === 0 && gaps.length === 0
        ? "Control plane stayed continuously alive, but no worker lease was active during sampled heartbeats; this can be a healthy quiet queue."
        : gaps.length === 0
          ? "Control plane continuity is proven for the overnight window."
          : "One or more heartbeat gaps exceeded the threshold; inspect logs around each gap to distinguish sleep, reboot, connectivity, or process failure."
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const report = buildOvernightReport({
    nightDate: arg("--date", inferNightDate()),
    maxGapMinutes: Number(arg("--max-gap-minutes", "5"))
  });
  console.log(JSON.stringify(report, null, process.argv.includes("--pretty") ? 2 : 0));
}
