export type TextSegment = { type: "text" | "link"; value: string };

const URL_REGEX = /(https?:\/\/[^\s)]+)|(www\.[^\s)]+)/gi;

export function splitTextByUrls(value: string): TextSegment[] {
  if (!value) return [{ type: "text", value: "" }];
  const segments: TextSegment[] = [];
  let lastIndex = 0;
  URL_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = URL_REGEX.exec(value)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: "text", value: value.slice(lastIndex, match.index) });
    }
    const raw = match[0];
    const href = raw.startsWith("http") ? raw : `https://${raw}`;
    segments.push({ type: "link", value: href });
    lastIndex = match.index + raw.length;
  }
  if (lastIndex < value.length) {
    segments.push({ type: "text", value: value.slice(lastIndex) });
  }
  if (segments.length === 0) {
    segments.push({ type: "text", value });
  }
  return segments;
}
