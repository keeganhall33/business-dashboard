/** Decision feedback normalizer with type-safe dispositions/reasons */

type Disposition = "ACCEPTED" | "REJECTED" | "DEFERRED" | "UNKNOWN";
type Reason = "PREFERENCE" | "FEASIBILITY" | "TIMING" | "EVIDENCE_DISAGREEMENT" | "OTHER" | "UNKNOWN";

interface DecisionFeedback {
  disposition: Disposition;
  reason?: Reason;
  valid: boolean;
}

function normalize(input: string): DecisionFeedback {
  const trimmed = (input || "").trim().toUpperCase();
  const parts = trimmed.split(" ");
  
  // Valid known dispositions and reasons for mapping
  const validDispositions = ["ACCEPTED", "REJECTED", "DEFERRED"];
  const validReasons = [
    "PREFERENCE", "FEASIBILITY", "TIMING",
    "EVIDENCE_DISAGREEMENT", "OTHER"
  ];
  
  // Check if first word is a known disposition (early exit for unknown)
  if (!validDispositions.includes(parts[0])) {
    return { disposition: "UNKNOWN", reason: "UNKNOWN", valid: false };
  }
  
  // Known disposition found - extract reason if available
  const disposition = parts[0] as Disposition;
  let reason: Reason = "UNKNOWN";
  
  if (parts.length > 1) {
    for (const r of validReasons) {
      if (parts[1] === r) {
        reason = r as Reason;
        break;
      }
    }
  }
  
  // Compute valid solely based on reason !== "UNKNOWN"
  const valid = reason !== "UNKNOWN";
  
  return { disposition, reason, valid };
}

export { normalize, type Disposition, type Reason, type DecisionFeedback };
