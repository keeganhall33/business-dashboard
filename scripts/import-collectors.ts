#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

type CliOptions = {
  inputPath: string;
  apply: boolean;
  batchId?: string;
  updatedBy: string;
};

type SanitizedCollector = {
  collectorName: string;
  tier: Tier;
  relationshipStatus: string;
  lastTouchAt: string;
  lastOutreachAt?: string;
  nextMove: string;
  nextMoveDueAt?: string;
  nextTouchDueAt?: string;
  estimatedValue: number | null;
  priorityScore: number;
  priorityLabel: PriorityLabel;
  notes?: string;
  source: string;
};

const NOTES_MAX_LENGTH = 1000;
const REQUIRED_COLUMNS = [
  "collector_name",
  "tier",
  "relationship_status",
  "last_touch_at",
  "next_move",
  "next_move_due_at",
  "estimated_value",
  "priority",
  "notes",
  "source"
];
const TierSchema = z.enum(["A", "B", "C", "Unrated"]);
const priorityLabelMap = {
  critical: 3,
  high: 2,
  medium: 1,
  low: 0,
} as const;
type PriorityLabel = keyof typeof priorityLabelMap;
type Tier = z.infer<typeof TierSchema>;

const RowSchema = z.object({
  collector_name: z.string().trim().min(1, "collector_name is required"),
  tier: z.string().trim().transform((value) => value.toUpperCase()).pipe(TierSchema),
  relationship_status: z.string().trim().min(1, "relationship_status is required"),
  last_touch_at: z.string().trim().min(1, "last_touch_at is required"),
  last_outreach_at: z.string().trim().optional(),
  next_move: z.string().trim().min(1, "next_move is required"),
  next_move_due_at: z.string().trim().min(1, "next_move_due_at is required"),
  next_touch_due_at: z.string().trim().optional(),
  estimated_value: z.string().trim().min(1, "estimated_value is required"),
  priority: z
    .string()
    .trim()
    .transform((value) => value.toLowerCase())
    .refine((value) => value in priorityLabelMap, {
      message: `priority must be one of ${Object.keys(priorityLabelMap).join(", ")}`
    }),
  notes: z.string().trim().optional(),
  source: z.string().trim().default("manual_import"),
});

async function main() {
  const options = parseCliOptions(process.argv.slice(2));
  const inputStats = await fs.stat(options.inputPath).catch(() => {
    throw new Error(`Input file not found: ${options.inputPath}`);
  });
  if (!inputStats.isFile()) {
    throw new Error(`Input must be a file: ${options.inputPath}`);
  }

  const csvBuffer = await fs.readFile(options.inputPath);
  const rawRows = parse(csvBuffer, {
    columns: true,
    skip_empty_lines: true,
    trim: true
  }) as Record<string, string>[];

  validateHeaders(rawRows);
  const { sanitized, invalidRows } = sanitizeRows(rawRows);
  const duplicateNames = findDuplicates(sanitized.map((row) => row.collectorName));

  const summary = buildSummary({ sanitized, invalidRows, duplicateNames, inputPath: options.inputPath });
  console.log(JSON.stringify(summary, null, 2));

  if (options.apply) {
    if (invalidRows.length > 0) {
      throw new Error("Cannot apply import while there are invalid rows. Fix errors and rerun --dry-run.");
    }
    if (duplicateNames.length > 0) {
      throw new Error("Cannot apply import with duplicate collector_name values. Deduplicate input and retry.");
    }
    await applyImport({ records: sanitized, options });
  }
}

function parseCliOptions(argv: string[]): CliOptions {
  const resolvedInput = getArgValue(argv, "--input") ?? getArgValue(argv, "-i");
  if (!resolvedInput) {
    throw new Error("--input <path> is required");
  }
  const forceDryRun = argv.includes("--dry-run");
  const applyFlag = argv.includes("--apply");
  if (forceDryRun && applyFlag) {
    throw new Error("Cannot specify both --dry-run and --apply");
  }
  const apply = !forceDryRun && applyFlag;
  const batchId = getArgValue(argv, "--batch-id");
  const updatedBy = getArgValue(argv, "--updated-by") ?? "collectors-import-script";
  return {
    inputPath: path.resolve(resolvedInput),
    apply,
    batchId,
    updatedBy
  };
}

function getArgValue(argv: string[], key: string): string | undefined {
  const index = argv.indexOf(key);
  if (index === -1) return undefined;
  return argv[index + 1];
}

function validateHeaders(rows: Record<string, string>[]) {
  const headers = rows[0] ? Object.keys(rows[0]) : [];
  const missing = REQUIRED_COLUMNS.filter((column) => !headers.includes(column));
  if (missing.length > 0) {
    throw new Error(`Input is missing required columns: ${missing.join(", ")}`);
  }
}

function sanitizeRows(rows: Record<string, string>[]) {
  const sanitized: SanitizedCollector[] = [];
  const invalidRows: { rowNumber: number; errors: string[] }[] = [];

  rows.forEach((row, idx) => {
    const rowNumber = idx + 2; // account for header row when referencing CSV line numbers
    const parsed = RowSchema.safeParse(row);
    if (!parsed.success) {
      invalidRows.push({ rowNumber, errors: parsed.error.issues.map((issue) => issue.message) });
      return;
    }
    try {
      sanitized.push(transformRow(parsed.data));
    } catch (error) {
      invalidRows.push({ rowNumber, errors: [error instanceof Error ? error.message : String(error)] });
    }
  });

  return { sanitized, invalidRows };
}

function transformRow(row: z.infer<typeof RowSchema>): SanitizedCollector {
  const lastTouchAt = toIsoOrThrow(row.last_touch_at, "last_touch_at");
  const lastOutreachAt = row.last_outreach_at ? toIsoOrThrow(row.last_outreach_at, "last_outreach_at") : undefined;
  const nextMoveDueAt = row.next_move_due_at ? toIsoOrThrow(row.next_move_due_at, "next_move_due_at") : undefined;
  const nextTouchDueAt = row.next_touch_due_at ? toIsoOrThrow(row.next_touch_due_at, "next_touch_due_at") : undefined;
  const estimatedValue = row.estimated_value ? Number(row.estimated_value) : null;
  if (Number.isNaN(estimatedValue ?? 0)) {
    throw new Error("estimated_value must be a number");
  }
  const priority = row.priority as PriorityLabel;
  const notes = row.notes?.slice(0, NOTES_MAX_LENGTH);

  return {
    collectorName: row.collector_name,
    tier: row.tier as Tier,
    relationshipStatus: row.relationship_status,
    lastTouchAt,
    lastOutreachAt,
    nextMove: row.next_move,
    nextMoveDueAt,
    nextTouchDueAt,
    estimatedValue,
    priorityScore: priorityLabelMap[priority],
    priorityLabel: priority,
    notes,
    source: row.source || "manual_import",
  };
}

function toIsoOrThrow(value: string, field: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${field} must be a valid ISO date`);
  }
  return date.toISOString();
}

function findDuplicates(values: string[]) {
  const seen = new Map<string, number>();
  const duplicates: { value: string; firstIndex: number; duplicateIndex: number }[] = [];
  values.forEach((value, idx) => {
    const normalized = value.toLowerCase();
    if (seen.has(normalized)) {
      duplicates.push({ value, firstIndex: seen.get(normalized)! + 2, duplicateIndex: idx + 2 });
    } else {
      seen.set(normalized, idx);
    }
  });
  return duplicates;
}

function buildSummary({
  sanitized,
  invalidRows,
  duplicateNames,
  inputPath
}: {
  sanitized: SanitizedCollector[];
  invalidRows: { rowNumber: number; errors: string[] }[];
  duplicateNames: { value: string; firstIndex: number; duplicateIndex: number }[];
  inputPath: string;
}) {
  const tiers: Record<string, number> = {};
  const priorities: Record<string, number> = {};
  sanitized.forEach((row) => {
    tiers[row.tier] = (tiers[row.tier] ?? 0) + 1;
    priorities[row.priorityLabel] = (priorities[row.priorityLabel] ?? 0) + 1;
  });
  const lastTouchDates = sanitized.map((row) => row.lastTouchAt).sort();
  const summary = {
    input: inputPath,
    totalRows: sanitized.length + invalidRows.length,
    validRows: sanitized.length,
    invalidRows,
    duplicateNames,
    tierCounts: tiers,
    priorityCounts: priorities,
    lastTouchRange: {
      oldest: lastTouchDates[0] ?? null,
      newest: lastTouchDates[lastTouchDates.length - 1] ?? null
    }
  };
  return summary;
}

async function applyImport({ records, options }: { records: SanitizedCollector[]; options: CliOptions }) {
  const supabase = createSupabaseClient();
  const batchId = options.batchId ?? crypto.randomUUID();
  const payload = records.map((record) => ({
    collector_name: record.collectorName,
    tier: record.tier,
    relationship_status: record.relationshipStatus,
    last_outreach_at: record.lastOutreachAt ?? null,
    last_touch_at: record.lastTouchAt,
    next_move: record.nextMove,
    next_move_due_at: record.nextMoveDueAt ?? null,
    next_touch_due_at: record.nextTouchDueAt ?? null,
    estimated_value: record.estimatedValue,
    priority: record.priorityScore,
    notes: record.notes ?? null,
    source: record.source,
    updated_by: options.updatedBy,
    import_batch_id: batchId
  }));

  const { error } = await supabase
    .from("collector_relationships")
    .upsert(payload, { onConflict: "collector_name" });
  if (error) {
    throw new Error(`Supabase upsert failed: ${error.message}`);
  }
  console.log(
    JSON.stringify(
      {
        applied: payload.length,
        batchId,
        updatedBy: options.updatedBy
      },
      null,
      2
    )
  );
}

function createSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error("Supabase env vars not set. Provide NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }
  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
