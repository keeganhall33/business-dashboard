type Props = {
  source: string;
  range: string;
  confidence: string;
  note?: string;
};

/**
 * Unified micro-label for dashboard modules so every recommendation discloses source + range + confidence.
 */
export function SourceRangeLabel({ source, range, confidence, note }: Props) {
  return (
    <p className="text-xs text-zinc-500">
      {source} · {range} · {confidence}
      {note ? ` · ${note}` : ""}
    </p>
  );
}
