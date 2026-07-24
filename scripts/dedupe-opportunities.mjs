#!/usr/bin/env node
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

function normalize(value = "") {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function buildNaturalKey(name = "", organization = "") {
  return crypto.createHash("sha256").update(`${normalize(name)}|${normalize(organization)}`).digest("hex");
}

function scoreRow(row) {
  const statusWeight = row.status === "ready_for_outreach" ? 2 : 1;
  const timestamp = new Date(row.updated_at).getTime();
  return statusWeight * 1_000_000_000 + timestamp;
}

function pickNonNull(values) {
  for (const value of values) {
    if (value !== null && value !== undefined && !(typeof value === "string" && value.trim() === "")) {
      return value;
    }
  }
  return null;
}

function summarizeBy(key, rows) {
  return rows.reduce((acc, row) => {
    const bucket = row[key] ?? "<null>";
    acc[bucket] = (acc[bucket] ?? 0) + 1;
    return acc;
  }, {});
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.error("Missing Supabase env vars NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await supabase.from("opportunity_pipeline").select("*");
  if (error) {
    console.error("Failed to load opportunity_pipeline:", error.message);
    process.exit(1);
  }

  const rows = data ?? [];
  const totalRowsBefore = rows.length;
  const rowsByStatusBefore = summarizeBy("status", rows);
  const rowsByOwnerBefore = summarizeBy("owner_agent", rows);

  const groups = new Map();
  for (const row of rows) {
    const key = row.natural_key ?? buildNaturalKey(row.name ?? "", row.organization ?? "");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  const duplicateGroups = [];
  for (const [naturalKey, groupedRows] of groups.entries()) {
    if (groupedRows.length <= 1) continue;
    groupedRows.sort((a, b) => scoreRow(b) - scoreRow(a));
    const canonical = groupedRows[0];
    const duplicates = groupedRows.slice(1);

    const mergedStatus = groupedRows.some((r) => r.status === "ready_for_outreach")
      ? "ready_for_outreach"
      : canonical.status;

    const mergedOwner = pickNonNull(groupedRows.map((r) => r.owner_agent)) ?? canonical.owner_agent;
    const mergedValue = pickNonNull(groupedRows.map((r) => r.value_estimate)) ?? canonical.value_estimate;
    const mergedPrestige = pickNonNull(groupedRows.map((r) => r.prestige_score)) ?? canonical.prestige_score;
    const mergedProbability = pickNonNull(groupedRows.map((r) => r.probability_score)) ?? canonical.probability_score;
    const mergedNextStep = pickNonNull(groupedRows.map((r) => r.next_step)) ?? canonical.next_step;
    const mergedNotes = pickNonNull(groupedRows.map((r) => r.notes_md)) ?? canonical.notes_md;
    const mergedSource = pickNonNull(groupedRows.map((r) => r.source)) ?? canonical.source;

    duplicateGroups.push({
      naturalKey,
      canonical: {
        id: canonical.id,
        status: canonical.status,
        owner_agent: canonical.owner_agent,
        updated_at: canonical.updated_at
      },
      duplicates: duplicates.map((row) => ({
        id: row.id,
        status: row.status,
        owner_agent: row.owner_agent,
        updated_at: row.updated_at
      })),
      mergedResult: {
        status: mergedStatus,
        owner_agent: mergedOwner,
        value_estimate: mergedValue,
        prestige_score: mergedPrestige,
        probability_score: mergedProbability,
        next_step: mergedNextStep,
        notes_md: mergedNotes,
        source: mergedSource
      }
    });
  }

  const afterRows = [];
  for (const [naturalKey, groupedRows] of groups.entries()) {
    if (groupedRows.length <= 1) {
      afterRows.push({
        status: groupedRows[0].status,
        owner_agent: groupedRows[0].owner_agent
      });
      continue;
    }

    const match = duplicateGroups.find((group) => group.naturalKey === naturalKey);
    afterRows.push({
      status: match?.mergedResult.status ?? groupedRows[0].status,
      owner_agent: match?.mergedResult.owner_agent ?? groupedRows[0].owner_agent
    });
  }

  const rowsByStatusAfter = afterRows.reduce((acc, row) => {
    acc[row.status ?? "<null>"] = (acc[row.status ?? "<null>"] ?? 0) + 1;
    return acc;
  }, {});

  const rowsByOwnerAfter = afterRows.reduce((acc, row) => {
    const owner = row.owner_agent ?? "<null>";
    acc[owner] = (acc[owner] ?? 0) + 1;
    return acc;
  }, {});

  const result = {
    totalRowsBefore,
    duplicateGroupCount: duplicateGroups.length,
    duplicateRowsToArchive: duplicateGroups.reduce((sum, group) => sum + group.duplicates.length, 0),
    totalRowsAfterCleanup: groups.size,
    rowsByStatusBefore,
    rowsByOwnerBefore,
    rowsByStatusAfter,
    rowsByOwnerAfter,
    groups: duplicateGroups
  };

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
