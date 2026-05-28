import type { DeliverableLink } from "@/lib/types/dashboard";

const PUBLIC_STORAGE_BASE = (() => {
  const explicit = process.env.NEXT_PUBLIC_DELIVERABLE_BASE_URL?.trim();
  if (explicit) {
    return explicit.endsWith("/") ? explicit.slice(0, -1) : explicit;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (supabaseUrl) {
    const normalized = supabaseUrl.endsWith("/") ? supabaseUrl.slice(0, -1) : supabaseUrl;
    return `${normalized}/storage/v1/object/public`;
  }

  return "";
})();

export function resolveDeliverableUrl(url: string) {
  if (!url) return url;
  if (/^https?:\/\//i.test(url)) return url;
  if (!PUBLIC_STORAGE_BASE) return url;
  const normalizedPath = url.startsWith("/") ? url : `/${url}`;
  return `${PUBLIC_STORAGE_BASE}${normalizedPath}`;
}

export function normalizeDeliverableLinks(value: unknown): DeliverableLink[] {
  if (!value) return [];

  let raw: unknown[] = [];
  if (Array.isArray(value)) {
    raw = value;
  } else if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) raw = parsed;
    } catch {
      raw = [];
    }
  }

  return raw
    .map((item) => {
      if (typeof item === "string") {
        const trimmed = item.trim();
        if (!trimmed) return null;
        const link: DeliverableLink = { label: trimmed, url: resolveDeliverableUrl(trimmed) };
        return link;
      }
      if (item && typeof item === "object") {
        const maybeLabel = (item as { label?: unknown }).label;
        const maybeUrl = (item as { url?: unknown }).url;
        if (typeof maybeUrl === "string" && maybeUrl.trim()) {
          const url = maybeUrl.trim();
          const label = typeof maybeLabel === "string" && maybeLabel.trim() ? maybeLabel.trim() : url;
          const link: DeliverableLink = { label, url: resolveDeliverableUrl(url) };
          return link;
        }
      }
      return null;
    })
    .filter((entry): entry is DeliverableLink => Boolean(entry));
}
