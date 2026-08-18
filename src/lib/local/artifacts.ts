import path from "node:path";
import { readFile } from "node:fs/promises";
import { parse } from "csv-parse/sync";
import type {
  AgentStatusPanelEntry,
  AutomationStatusEntry,
  DashboardActionItem,
  DataSourceAccessEntry,
  WebsiteConversionSnapshot,
  MetaAdsSnapshot,
  IndustryPulseSnapshot,
  SocialIntelligenceSnapshot,
  LeadIntelligenceSnapshot,
  CloudflareTelemetrySnapshot
} from "@/lib/types/dashboard";

const DASHBOARD_ROOT = path.resolve(process.cwd(), "..", "dashboard");
const WEBSITE_SNAPSHOT_PATH = path.join(DASHBOARD_ROOT, "data", "website", "latest.json");
const META_SNAPSHOT_PATH = path.join(DASHBOARD_ROOT, "data", "meta", "latest.json");
const INDUSTRY_SNAPSHOT_PATH = path.join(DASHBOARD_ROOT, "data", "industry", "latest.json");
const SOCIAL_SNAPSHOT_PATH = path.join(DASHBOARD_ROOT, "data", "social", "latest.json");
const LEAD_SNAPSHOT_PATH = path.join(DASHBOARD_ROOT, "data", "leads", "latest.json");
const CLOUDFLARE_SNAPSHOT_PATH = path.join(DASHBOARD_ROOT, "data", "cloudflare", "latest.json");
const AGENT_STATUS_PATH = path.join(DASHBOARD_ROOT, "agent_status_panel.csv");
const AUTOMATION_STATUS_PATH = path.join(DASHBOARD_ROOT, "automation_status_panel.csv");
const DATA_SOURCE_MATRIX_PATH = path.join(DASHBOARD_ROOT, "data_source_access_matrix.csv");

export type LocalDashboardArtifacts = {
  websiteSnapshot: WebsiteConversionSnapshot | null;
  metaSnapshot: MetaAdsSnapshot | null;
  executiveSummary: null;
  industrySnapshot: IndustryPulseSnapshot | null;
  socialSnapshot: SocialIntelligenceSnapshot | null;
  leadSnapshot: LeadIntelligenceSnapshot | null;
  cloudflareSnapshot: CloudflareTelemetrySnapshot | null;
  agentStatus: AgentStatusPanelEntry[];
  automationStatus: AutomationStatusEntry[];
  dataSourceMatrix: DataSourceAccessEntry[];
  topActions: DashboardActionItem[];
  blockedItems: DashboardActionItem[];
};

export async function loadLocalDashboardArtifacts(): Promise<LocalDashboardArtifacts> {
  const [snapshot, meta, industry, social, leads, cloudflare, agentStatusRows, automationRows, dataSourceRows] = await Promise.all([
    readJsonIfExists<WebsiteConversionSnapshot>(WEBSITE_SNAPSHOT_PATH),
    readJsonIfExists<MetaAdsSnapshot>(META_SNAPSHOT_PATH),
    readJsonIfExists<IndustryPulseSnapshot>(INDUSTRY_SNAPSHOT_PATH),
    readJsonIfExists<SocialIntelligenceSnapshot>(SOCIAL_SNAPSHOT_PATH),
    readJsonIfExists<LeadIntelligenceSnapshot>(LEAD_SNAPSHOT_PATH),
    readJsonIfExists<CloudflareTelemetrySnapshot>(CLOUDFLARE_SNAPSHOT_PATH),
    readCsvIfExists(AGENT_STATUS_PATH),
    readCsvIfExists(AUTOMATION_STATUS_PATH),
    readCsvIfExists(DATA_SOURCE_MATRIX_PATH)
  ]);

  const agentStatus = agentStatusRows.map(mapAgentStatusRow);
  const automationStatus = automationRows.map(mapAutomationRow);
  const dataSourceMatrix = dataSourceRows.map(mapDataSourceRow);
  const blockedItems = buildBlockedItems(snapshot, dataSourceMatrix);

  return {
    websiteSnapshot: snapshot,
    metaSnapshot: meta,
    executiveSummary: null,
    industrySnapshot: industry,
    socialSnapshot: social,
    leadSnapshot: leads,
    cloudflareSnapshot: cloudflare,
    agentStatus,
    automationStatus,
    dataSourceMatrix,
    topActions: [],
    blockedItems
  };
}

async function readJsonIfExists<T>(absolutePath: string): Promise<T | null> {
  try {
    const raw = await readFile(absolutePath, "utf8");
    return JSON.parse(raw) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    console.warn(`[dashboard] Failed to read JSON at ${absolutePath}:`, error);
    return null;
  }
}

async function readCsvIfExists(absolutePath: string): Promise<Record<string, string>[]> {
  try {
    const raw = await readFile(absolutePath, "utf8");
    return parse(raw, {
      columns: true,
      skip_empty_lines: true,
      trim: true
    }) as Record<string, string>[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    console.warn(`[dashboard] Failed to read CSV at ${absolutePath}:`, error);
    return [];
  }
}

function mapAgentStatusRow(row: Record<string, string>): AgentStatusPanelEntry {
  return {
    agentName: row["Agent Name"] ?? row.agent ?? "Unnamed agent",
    cadence: row["Cadence"] ?? null,
    lastRunAt: normalizeDate(row["Last Run Timestamp"]),
    runStatus: row["Run Status"] ?? null,
    nextRunAt: normalizeDate(row["Next Scheduled Run"]),
    issues: row["Issues/Notes"] ?? null,
    dataSources: splitList(row["Data Sources Used"]),
    actions: splitList(row["Actions Pending"])
  };
}

function mapAutomationRow(row: Record<string, string>): AutomationStatusEntry {
  return {
    jobName: row["Job Name"] ?? "Unnamed job",
    frequency: row["Frequency"] ?? null,
    expectedRunTime: row["Expected Run Time"] ?? null,
    lastRunAt: normalizeDate(row["Last Run Timestamp"]),
    lastResult: row["Last Run Result"] ?? null,
    logLink: sanitizeUrl(row["Log Link"] ?? null),
    nextRunAt: normalizeDate(row["Next Run"]),
    alertStatus: row["Alert Status"] ?? null,
    notes: row["Notes/Blockers"] ?? null
  };
}

function mapDataSourceRow(row: Record<string, string>): DataSourceAccessEntry {
  return {
    name: row["Data Source"] ?? "Unknown",
    status: row["Status"] ?? "Unknown",
    lastVerified: normalizeDate(row["Last Verified"]),
    owner: row["Owner/POC"] ?? null,
    credentialLocation: row["Credential Location"] ?? null,
    accessMethod: row["API/Export Access"] ?? null,
    notes: row["Notes / Action Required"] ?? null
  };
}

function splitList(value?: string | null) {
  if (!value) return [];
  return value
    .split(/[,;\n]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function normalizeDate(value?: string | null) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === "tbd" || trimmed.toLowerCase() === "not yet run") return trimmed || null;
  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? trimmed : date.toISOString();
}

function sanitizeUrl(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.href;
  } catch {
    return null;
  }
}

function buildBlockedItems(
  snapshot: WebsiteConversionSnapshot | null,
  dataSources: DataSourceAccessEntry[]
): DashboardActionItem[] {
  const items: DashboardActionItem[] = [];

  snapshot?.ga4?.warnings?.forEach((warning) => {
    items.push({
      title: "GA4 metric warning",
      detail: warning,
      owner: "Website & Conversion",
      tone: "warning"
    });
  });

  dataSources
    .filter((row) => /pending|unknown|inaccessible|credential/i.test(row.status))
    .forEach((row) => {
      items.push({
        title: row.name,
        detail: row.notes || row.status,
        owner: row.owner ?? undefined,
        tone: "warning"
      });
    });

  return items.slice(0, 4);
}
