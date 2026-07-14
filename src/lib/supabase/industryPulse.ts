import { getSupabaseServerClient } from "./server.ts";
import type { IndustryPulseDaySnapshot, IndustryPulseOpportunity, IndustryPulseContactStatus } from "@/lib/types/industryPulse";

type PostgrestError = {
  code?: string;
  details?: string | null;
  hint?: string | null;
  message?: string | null;
};

function isMissingTableError(error: unknown, table: string) {
  if (!error || typeof error !== "object") return false;
  const pgError = error as PostgrestError;
  if (pgError.code !== "PGRST205") return false;
  const haystack = `${pgError.message ?? ""} ${pgError.hint ?? ""} ${pgError.details ?? ""}`.toLowerCase();
  return haystack.includes(`public.${table}`) || haystack.includes(`'${table}'`);
}

function isoDay(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())).toISOString().slice(0, 10);
}

function clamp01(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.min(1, value));
  }
  return null;
}

function coerceStatus(value: unknown): IndustryPulseContactStatus {
  return value === "verified" || value === "suspected" || value === "unknown" ? value : "unknown";
}

function coerceString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  return null;
}

function normalizeSystemState(valueJson: unknown, day: string, limit: number): IndustryPulseDaySnapshot {
  const fallback: IndustryPulseDaySnapshot = { day, refreshedAtIso: new Date().toISOString(), items: [] };
  if (!valueJson || typeof valueJson !== "object") return fallback;

  const payload = valueJson as Record<string, unknown>;
  const refreshedAtIso = coerceString(payload.refreshedAtIso) ?? coerceString(payload.lastRefreshedAt) ?? fallback.refreshedAtIso;

  // Supported shapes:
  // 1) { days: [{ day, refreshedAtIso, items: [...] }, ...] }
  // 2) { day, refreshedAtIso, items: [...] }
  // 3) { opportunities: [...] } (assumed to be for the requested day)
  const dayEntry = Array.isArray(payload.days)
    ? (payload.days as unknown[]).find((entry) => {
        if (!entry || typeof entry !== "object") return false;
        return (entry as Record<string, unknown>).day === day || (entry as Record<string, unknown>).date === day;
      })
    : null;

  const container = (dayEntry && typeof dayEntry === "object") ? (dayEntry as Record<string, unknown>) : payload;
  const itemsRaw =
    (Array.isArray(container.items) ? container.items : null) ??
    (Array.isArray(container.opportunities) ? container.opportunities : null) ??
    [];

  const items: IndustryPulseOpportunity[] = (itemsRaw as unknown[])
    .filter((row) => row && typeof row === "object")
    .slice(0, Math.max(1, Math.min(50, limit)))
    .map((row, idx) => {
      const r = row as Record<string, unknown>;
      const id = coerceString(r.id) ?? `${day}:${idx}`;
      return {
        id,
        day,
        source: coerceString(r.source) ?? "Unknown",
        headline: coerceString(r.headline) ?? coerceString(r.title) ?? "Untitled opportunity",
        summary: coerceString(r.summary) ?? "",
        collabIdea: coerceString(r.collabIdea) ?? coerceString(r.collab_idea) ?? coerceString(r.idea) ?? "",
        whyNow: coerceString(r.whyNow) ?? coerceString(r.why_now) ?? "",
        contactName: coerceString((r as Record<string, unknown>).contactName ?? (r as Record<string, unknown>).contact_name),
        contactEmail: coerceString(r.contactEmail) ?? coerceString(r.contact_email),
        contactEmailSource: coerceString(
          (r as Record<string, unknown>).contactEmailSource ?? (r as Record<string, unknown>).contact_email_source
        ),
        contactConfidence: clamp01(r.contactConfidence ?? r.contact_confidence),
        contactStatus: coerceStatus(r.contactStatus ?? r.contact_status),
        sourceUrl: coerceString(r.sourceUrl) ?? coerceString(r.source_url)
      };
    });

  return {
    day,
    refreshedAtIso: coerceString(container.refreshedAtIso) ?? refreshedAtIso,
    items
  };
}

export async function getIndustryPulseSnapshot(input?: { day?: string; days?: number; limit?: number }) {
  const day = input?.day ?? isoDay();
  const days = input?.days ?? 14;
  const limit = input?.limit ?? 5;
  const supabase = getSupabaseServerClient();

  // Try dedicated table first (preferred).
  // Expected columns (loosely): day, source, headline, summary, collab_idea, why_now, contact_email, contact_confidence, contact_status, source_url.
  const { data: availableRows, error: availableError } = await supabase
    .from("industry_pulse_opportunities")
    .select("day")
    .order("day", { ascending: false })
    .limit(days * 10);

  if (!availableError && Array.isArray(availableRows)) {
    const availableDays = Array.from(
      new Set(
        availableRows
          .map((r: { day?: string | null }) => r.day ?? null)
          .filter((d): d is string => Boolean(d))
      )
    )
      .sort((a, b) => b.localeCompare(a))
      .slice(0, days);

    if (availableDays.length > 0) {
      const effectiveDay = availableDays.includes(day) ? day : availableDays[0] ?? day;

      const { data: rows, error } = await supabase
        .from("industry_pulse_opportunities")
        .select(
          "id,day,source,headline,summary,collab_idea,why_now,contact_name,contact_email,contact_email_source,contact_confidence,contact_status,source_url"
        )
        .eq("day", effectiveDay)
        .order("contact_confidence", { ascending: false, nullsFirst: false })
        .limit(limit);
      if (error) throw error;

      const refreshedAtIso = new Date().toISOString();
      const items: IndustryPulseOpportunity[] = (rows ?? []).map((row: Record<string, unknown>, idx: number) => ({
        id: coerceString(row.id) ?? `${effectiveDay}:${idx}`,
        day: effectiveDay,
        source: coerceString(row.source) ?? "Unknown",
        headline: coerceString(row.headline) ?? "Untitled opportunity",
        summary: coerceString(row.summary) ?? "",
        collabIdea: coerceString(row.collab_idea) ?? "",
        whyNow: coerceString(row.why_now) ?? "",
        contactName: coerceString(row.contact_name),
        contactEmail: coerceString(row.contact_email),
        contactEmailSource: coerceString(row.contact_email_source),
        contactConfidence: clamp01(row.contact_confidence),
        contactStatus: coerceStatus(row.contact_status),
        sourceUrl: coerceString(row.source_url)
      }));

      return {
        snapshot: { day: effectiveDay, refreshedAtIso, items } satisfies IndustryPulseDaySnapshot,
        availableDays
      };
    }
  }

  if (availableError && !isMissingTableError(availableError, "industry_pulse_opportunities")) {
    throw availableError;
  }

  // Fallback to featured rows in industry_news_articles.
  const { data: featuredDaysRows, error: featuredDaysError } = await supabase
    .from("industry_news_articles")
    .select("featured_date")
    .not("featured_date", "is", null)
    .order("featured_date", { ascending: false })
    .limit(days * 5);
  if (featuredDaysError && !isMissingTableError(featuredDaysError, "industry_news_articles")) {
    throw featuredDaysError;
  }

  const featuredAvailableDays = Array.from(
    new Set(
      (featuredDaysRows ?? [])
        .map((row: { featured_date?: string | null }) => row.featured_date ?? null)
        .filter((d): d is string => Boolean(d))
    )
  )
    .sort((a, b) => b.localeCompare(a))
    .slice(0, days);

  if (featuredAvailableDays.length > 0) {
    const effectiveDay = featuredAvailableDays.includes(day) ? day : featuredAvailableDays[0] ?? day;
    const { data: rows, error } = await supabase
      .from("industry_news_articles")
      .select(
        "id,featured_date,featured_rank,source_name,title,summary,collab_concept,why_now,contact_name,contact_email,contact_email_source,score,url"
      )
      .eq("featured_date", effectiveDay)
      .order("featured_rank", { ascending: true })
      .limit(limit);
    if (error) throw error;

    const refreshedAtIso = new Date().toISOString();
    const items: IndustryPulseOpportunity[] = (rows ?? []).map((row: Record<string, unknown>, idx: number) => ({
      id: coerceString(row.id) ?? `${effectiveDay}:${idx}`,
      day: effectiveDay,
      source: coerceString(row.source_name) ?? "Unknown",
      headline: coerceString(row.title) ?? "Untitled opportunity",
      summary: coerceString(row.summary) ?? "",
      collabIdea: coerceString(row.collab_concept) ?? "",
      whyNow: coerceString(row.why_now) ?? "",
      contactName: coerceString(row.contact_name),
      contactEmail: coerceString(row.contact_email),
      contactEmailSource: coerceString(row.contact_email_source),
      contactConfidence: clamp01(row.score),
      contactStatus: "unknown",
      sourceUrl: coerceString(row.url)
    }));

    return {
      snapshot: { day: effectiveDay, refreshedAtIso, items } satisfies IndustryPulseDaySnapshot,
      availableDays: featuredAvailableDays
    };
  }

  // Fallback to system_state: allow ingestion to drop JSON into system_state.industry_pulse
  const state = await supabase.from("system_state").select("value_json,updated_at").eq("key", "industry_pulse").maybeSingle();
  if (state.error) throw state.error;

  const availableDays = (() => {
    const valueJson = state.data?.value_json as unknown;
    if (!valueJson || typeof valueJson !== "object") return [day];
    const payload = valueJson as Record<string, unknown>;
    if (!Array.isArray(payload.days)) return [day];
    return (payload.days as unknown[])
      .filter((entry) => entry && typeof entry === "object")
      .map((entry) => {
        const e = entry as Record<string, unknown>;
        return (typeof e.day === "string" ? e.day : typeof e.date === "string" ? e.date : null) as string | null;
      })
      .filter((d): d is string => Boolean(d))
      .sort((a, b) => b.localeCompare(a))
      .slice(0, days);
  })();

  const effectiveDay = availableDays.includes(day) ? day : availableDays[0] ?? day;
  const snapshot = normalizeSystemState(state.data?.value_json, effectiveDay, limit);
  const refreshedAtIso = coerceString((state.data as Record<string, unknown> | null)?.updated_at) ?? snapshot.refreshedAtIso;
  return {
    snapshot: { ...snapshot, refreshedAtIso },
    availableDays
  };
}
