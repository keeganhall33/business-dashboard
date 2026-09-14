import { readFile, stat } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import { buildRevenueDecisionPacketV1 } from "../src/lib/intelligence/production-revenue-loop/decision-packet-v1.ts";

export const PRODUCTION_REVENUE_DECISION_LOOP_RUN_VERSION =
  "PRODUCTION_REVENUE_DECISION_LOOP_RUN_V1";
export const MAX_REVENUE_DECISION_INPUT_BYTES = 1024 * 1024;

const TOP_LEVEL_KEYS = [
  "comparisonRange",
  "currentRange",
  "generatedAt",
  "observations",
];
const RANGE_KEYS = ["endDate", "startDate"];
const OBSERVATION_KEYS = [
  "current",
  "evidenceRefs",
  "observedAt",
  "previous",
  "source",
  "truthState",
];
const METRIC_KEYS = [
  "attributedPurchaseValueCents",
  "averageOrderValueCents",
  "orders",
  "revenueCents",
  "sessions",
  "spendCents",
];

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value, allowedKeys) {
  if (!isRecord(value)) return false;
  const actualKeys = Object.keys(value).sort();
  return (
    actualKeys.length === allowedKeys.length &&
    actualKeys.every((key, index) => key === allowedKeys[index])
  );
}

function hasBoundedShape(input) {
  if (!hasExactKeys(input, TOP_LEVEL_KEYS)) return false;
  if (!hasExactKeys(input.currentRange, RANGE_KEYS)) return false;
  if (!hasExactKeys(input.comparisonRange, RANGE_KEYS)) return false;
  if (!Array.isArray(input.observations) || input.observations.length > 3) return false;

  return input.observations.every(
    (observation) =>
      hasExactKeys(observation, OBSERVATION_KEYS) &&
      hasExactKeys(observation.current, METRIC_KEYS) &&
      hasExactKeys(observation.previous, METRIC_KEYS),
  );
}

function invalidPacket(generatedAt = "UNKNOWN") {
  return buildRevenueDecisionPacketV1({
    generatedAt,
    currentRange: { startDate: "INVALID", endDate: "INVALID" },
    comparisonRange: { startDate: "INVALID", endDate: "INVALID" },
    observations: [],
  });
}

function freezeRun(run) {
  return Object.freeze(run);
}

/**
 * Executes the read-only production revenue decision seam.
 *
 * The caller must provide canonical Woo, GA4, and Meta observations. The run
 * never writes evidence, changes spend, edits pricing, mutates checkout, or
 * performs outreach. It only returns a bounded decision packet for review.
 */
export function runProductionRevenueDecisionLoopV1(input) {
  const boundedInput = hasBoundedShape(input)
    ? structuredClone(input)
    : null;
  const packet = boundedInput
    ? buildRevenueDecisionPacketV1(boundedInput)
    : invalidPacket(
        isRecord(input) && typeof input.generatedAt === "string"
          ? input.generatedAt
          : "UNKNOWN",
      );

  return freezeRun({
    contractVersion: PRODUCTION_REVENUE_DECISION_LOOP_RUN_VERSION,
    packet,
    externalMutationPerformed: false,
  });
}

function safeError(reasonCode) {
  return Object.freeze({
    contractVersion: PRODUCTION_REVENUE_DECISION_LOOP_RUN_VERSION,
    status: "ERROR",
    reasonCode,
    externalMutationPerformed: false,
  });
}

async function readBoundedStdin() {
  const chunks = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > MAX_REVENUE_DECISION_INPUT_BYTES) {
      throw new Error("INPUT_TOO_LARGE");
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function readBoundedFile(path) {
  const file = await stat(path);
  if (!file.isFile() || file.size > MAX_REVENUE_DECISION_INPUT_BYTES) {
    throw new Error("INPUT_TOO_LARGE");
  }
  return readFile(path, "utf8");
}

async function readCliInput(argv) {
  if (argv.length === 0) return readBoundedStdin();
  if (argv.length === 2 && argv[0] === "--input" && argv[1].trim()) {
    return readBoundedFile(argv[1]);
  }
  throw new Error("INVALID_ARGUMENTS");
}

export async function main(argv = process.argv.slice(2)) {
  try {
    const rawInput = await readCliInput(argv);
    if (Buffer.byteLength(rawInput, "utf8") > MAX_REVENUE_DECISION_INPUT_BYTES) {
      throw new Error("INPUT_TOO_LARGE");
    }
    const run = runProductionRevenueDecisionLoopV1(JSON.parse(rawInput));
    process.stdout.write(`${JSON.stringify(run, null, 2)}\n`);
    process.exitCode = run.packet.status === "INVALID_INPUT" ? 2 : 0;
  } catch (error) {
    const reasonCode =
      error instanceof Error && error.message === "INPUT_TOO_LARGE"
        ? "INPUT_TOO_LARGE"
        : "INPUT_REJECTED";
    process.stdout.write(`${JSON.stringify(safeError(reasonCode), null, 2)}\n`);
    process.exitCode = 2;
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await main();
}
