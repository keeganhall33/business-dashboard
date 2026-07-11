import fetch, { Response } from "node-fetch";
import type { GraphRequestCounters, GraphUsageSnapshot } from "./types.ts";

const GRAPH_BASE = "https://graph.facebook.com";
const DEFAULT_VERSION = "v25.0";
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const RETRYABLE_ERROR_CODES = new Set([4, 17, 32, 613, 80004, 80007]);

type GraphClientOptions = {
  accessToken: string;
  apiVersion?: string;
  maxRetries?: number;
  maxPages?: number;
  logger?: (message: string) => void;
  fetchImpl?: typeof fetch;
};

type RequestConfig = {
  label: string;
};

export class GraphClient {
  private readonly accessToken: string;
  private readonly apiVersion: string;
  private readonly maxRetries: number;
  private readonly maxPages: number;
  private readonly logger?: (message: string) => void;
  private readonly counters: GraphRequestCounters = {};
  private readonly usage: GraphUsageSnapshot = { throttleEvents: [] };
  private versionWarnings = new Set<string>();
  private lastReportedVersion: string | null = null;
  private readonly fetchImpl: typeof fetch;

  constructor(options: GraphClientOptions) {
    this.accessToken = options.accessToken;
    this.apiVersion = options.apiVersion ?? DEFAULT_VERSION;
    this.maxRetries = Math.max(0, options.maxRetries ?? 3);
    this.maxPages = Math.max(1, options.maxPages ?? 25);
    this.logger = options.logger;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  getUsageSnapshot(): GraphUsageSnapshot {
    return {
      adAccountUsage: this.usage.adAccountUsage ?? null,
      appUsage: this.usage.appUsage ?? null,
      businessUsage: this.usage.businessUsage ?? null,
      throttleEvents: [...this.usage.throttleEvents]
    };
  }

  getRequestCounters(): GraphRequestCounters {
    return { ...this.counters };
  }

  getVersionWarnings(): string[] {
    return Array.from(this.versionWarnings);
  }

  getReturnedVersion(): string | null {
    return this.lastReportedVersion;
  }

  async fetchCollection(path: string, params: Record<string, unknown>, config: RequestConfig) {
    const records: unknown[] = [];
    let nextUrl: string | null = this.buildUrl(path, params);
    let pages = 0;

    while (nextUrl) {
      pages += 1;
      if (pages > this.maxPages) {
        throw new Error(`Exceeded max pages (${this.maxPages}) for ${config.label}`);
      }
      const { json } = await this.performRequest(nextUrl, config);
      const pageData = extractDataArray(json);
      if (pageData.length) {
        records.push(...pageData);
      }
      nextUrl = extractNextUrl(json);
    }

    return records;
  }

  async get(path: string, params: Record<string, unknown>, config: RequestConfig) {
    const url = this.buildUrl(path, params);
    const { json } = await this.performRequest(url, config);
    return json;
  }

  private buildUrl(path: string, params: Record<string, unknown>): string {
    const url = new URL(`${GRAPH_BASE}/${this.apiVersion}/${path.replace(/^\//, "")}`);
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null) continue;
      if (typeof value === "object") {
        url.searchParams.set(key, JSON.stringify(value));
      } else {
        url.searchParams.set(key, String(value));
      }
    }
    return url.toString();
  }

  private async performRequest(url: string, config: RequestConfig): Promise<{ json: unknown; response: Response }> {
    this.incrementCounter(config.label);
    let attempt = 0;
    let lastError: Error | null = null;

    while (attempt <= this.maxRetries) {
      attempt += 1;
      const response = await this.fetchImpl(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.accessToken}`
        }
      });
      await this.captureHeaders(response, config.label);

      if (response.ok) {
        const json = await response.json();
        return { json, response };
      }

      const body = await safeJson(response);
      if (!shouldRetry(response, body) || attempt > this.maxRetries) {
        const message = buildErrorMessage(url, response, body);
        lastError = new Error(message);
        break;
      }

      this.recordThrottleEvent(url, response, body);
      await delay(Math.min(1000 * attempt, 5000));
    }

    throw lastError ?? new Error(`Graph API request failed for ${redactUrl(url)}`);
  }

  private incrementCounter(label: string) {
    this.counters[label] = (this.counters[label] ?? 0) + 1;
  }

  private async captureHeaders(response: Response, label: string) {
    const apiVersion = response.headers.get("facebook-api-version");
    if (apiVersion) {
      this.lastReportedVersion = apiVersion;
      if (apiVersion !== this.apiVersion) {
        this.versionWarnings.add(
          `Endpoint ${label} returned api version ${apiVersion}; requested ${this.apiVersion}`
        );
      }
    }
    const adUsage = response.headers.get("x-ad-account-usage");
    const appUsage = response.headers.get("x-app-usage");
    const businessUsage = response.headers.get("x-business-use-case-usage");
    if (adUsage) this.usage.adAccountUsage = safeParseHeader(adUsage);
    if (appUsage) this.usage.appUsage = safeParseHeader(appUsage);
    if (businessUsage) this.usage.businessUsage = safeParseHeader(businessUsage);
  }

  private recordThrottleEvent(url: string, response: Response, body: unknown) {
    const graphError = extractGraphError(body);
    const message = sanitizeGraphMessage(graphError?.message ?? response.statusText);
    this.usage.throttleEvents.push({
      endpoint: redactUrl(url),
      status: response.status,
      message
    });
    this.logger?.(
      `[meta-history] Throttle/retry triggered (${response.status}) for ${redactUrl(url)}: ${message}`
    );
  }
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function shouldRetry(response: Response, body: unknown): boolean {
  if (RETRYABLE_STATUS.has(response.status)) return true;
  const graphError = extractGraphError(body);
  if (graphError?.code !== undefined && RETRYABLE_ERROR_CODES.has(graphError.code)) {
    return true;
  }
  return false;
}

function buildErrorMessage(url: string, response: Response, body: unknown): string {
  const base = `Graph API ${response.status} ${response.statusText} for ${redactUrl(url)}`;
  const graphError = extractGraphError(body);
  if (graphError?.message) {
    return `${base}: ${sanitizeGraphMessage(graphError.message)}`;
  }
  return base;
}

function redactUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.searchParams.has("access_token")) {
      parsed.searchParams.set("access_token", "REDACTED");
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

function safeParseHeader(value: string): Record<string, unknown> | null {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractDataArray(payload: unknown): unknown[] {
  if (!payload || typeof payload !== "object") return [];
  const data = (payload as Record<string, unknown>).data;
  return Array.isArray(data) ? data : [];
}

function extractNextUrl(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const paging = (payload as Record<string, unknown>).paging;
  if (!paging || typeof paging !== "object") return null;
  const next = (paging as Record<string, unknown>).next;
  return typeof next === "string" ? next : null;
}

function extractGraphError(payload: unknown): { message?: string; code?: number } | null {
  if (!payload || typeof payload !== "object") return null;
  const rawError = (payload as Record<string, unknown>).error;
  if (!rawError || typeof rawError !== "object") return null;
  const error = rawError as Record<string, unknown>;
  const message = typeof error.message === "string" ? error.message : undefined;
  const code = typeof error.code === "number" ? error.code : undefined;
  if (message === undefined && code === undefined) return null;
  return { message, code };
}

function sanitizeGraphMessage(message: string | undefined): string {
  if (!message) return "";
  return message.replace(/access_token=[^&\s]+/gi, "access_token=REDACTED");
}
