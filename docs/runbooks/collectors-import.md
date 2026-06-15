# Collectors Import Runbook

Collectors remain a critical dependency for the Command Center. This runbook defines the repo-owned import tooling required to move the Collectors panel from **BROKEN** to **PARTIAL**, and eventually to **LIVE** once the process is automated.

## 1. CSV format

Create a CSV with the following columns (header order can vary, but the column names must match exactly):

| Column | Required | Notes |
| --- | --- | --- |
| `collector_name` | ✅ | Unique name; duplicates are rejected. |
| `tier` | ✅ | One of `A`, `B`, `C`, `Unrated`. |
| `relationship_status` | ✅ | Free text (`active`, `quiet`, `dormant`, ...). |
| `last_touch_at` | ✅ | ISO 8601 timestamp. |
| `last_outreach_at` | optional | Last outbound action (ISO timestamp). |
| `next_move` | ✅ | Short plan for the next step. |
| `next_move_due_at` | ✅ | ISO date/time for the next move. |
| `next_touch_due_at` | optional | Optional reminder date. |
| `estimated_value` | ✅ | Number (USD). |
| `priority` | ✅ | `critical`, `high`, `medium`, or `low`. |
| `notes` | ✅ | Narrative context (≤1000 chars; excess is trimmed). |
| `source` | ✅ | e.g., `manual_import`, `crm_export`, `agent_noah`. |

> **Do not commit raw CSVs.** Store working files in a local directory such as `collector-imports/` (ignored by git).

## 2. Import script

### Dry-run (required)

```bash
npx tsx scripts/import-collectors.ts --input collector-imports/2026-06-15.csv --dry-run
```

Dry-run validation outputs:

- total rows / valid rows / invalid rows (with line numbers)
- duplicate `collector_name` references
- tier + priority counts
- newest / oldest `last_touch_at`

Resolve any validation errors before continuing.

### Apply (after approval)

After reviewing the dry-run summary, run the import with explicit approval:

```bash
npx tsx scripts/import-collectors.ts --input collector-imports/2026-06-15.csv --apply --batch-id 20260615-wave4f --updated-by jeeves
```

The script upserts into `collector_relationships` on `collector_name`, annotating every row with `source`, `updated_by`, and `import_batch_id`.

## 3. Freshness check

Use the companion checker to summarize the table without exposing collector details:

```bash
npx tsx scripts/check-collector-freshness.ts
```

Output includes row count, tier/priority histograms, oldest/newest `last_touch_at`, and a status recommendation:

- **PARTIAL** — newest touch ≤ 14 days ago.
- **STALE** — newest touch between 15–30 days.
- **BROKEN** — newest touch > 30 days or no data.

Note: reaching **LIVE** additionally requires an automated import that has succeeded at least twice; this script only reports freshness.

## 4. Status thresholds & UI rules

| Status | Criteria | UI behavior |
| --- | --- | --- |
| PARTIAL | Manual import within 14 days with proof artifacts | Panel can reappear with `PARTIAL / manual import` badge + timestamp. |
| LIVE | Automated import + monitoring; two consecutive successful runs | Panel can drop manual badge; Executive dependency satisfied. |
| BROKEN | > 30 days old, invalid import, or missing data | Panel stays hidden; Executive remains blocked. |

Executive summary stays hidden until Collectors are at least PARTIAL **and** the dependency checklist (Website, Cloudflare, Scheduler, Meta, Pipeline, War Room, Collectors) is re-verified.

## 5. Approval + proof log

1. Run dry-run, capture JSON summary (`logs/collectors-import/<timestamp>-dry-run.json`).
2. Share summary for approval (Command Center, PR, or chat).
3. After approval, run `--apply` and store the resulting summary.
4. Immediately run `npx tsx scripts/check-collector-freshness.ts` and archive the output alongside the import proof.

Only after these steps pass can the Collectors panel be considered for PARTIAL re-enable.
