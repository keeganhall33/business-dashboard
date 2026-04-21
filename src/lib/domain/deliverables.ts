import type { DeliverableLink } from "@/lib/types/dashboard";

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
        const link: DeliverableLink = { label: trimmed, url: trimmed };
        return link;
      }
      if (item && typeof item === "object") {
        const maybeLabel = (item as { label?: unknown }).label;
        const maybeUrl = (item as { url?: unknown }).url;
        if (typeof maybeUrl === "string" && maybeUrl.trim()) {
          const url = maybeUrl.trim();
          const label = typeof maybeLabel === "string" && maybeLabel.trim() ? maybeLabel.trim() : url;
          const link: DeliverableLink = { label, url };
          return link;
        }
      }
      return null;
    })
    .filter((entry): entry is DeliverableLink => Boolean(entry));
}
