import {
  executiveApprovalLabel,
  executiveBlockerCopy,
  executiveConfidenceLabel,
  executiveMissingDataLabels,
  executiveSourceModeLabel,
  executiveTruthLabel,
  executiveUrgencyLabel,
} from "@/lib/presentation/executive-language-v1";

describe("executive language v1", () => {
  it("translates internal truth and confidence states", () => {
    expect(executiveTruthLabel("UNKNOWN")).toBe("Not yet verified");
    expect(executiveTruthLabel("CONFLICTED")).toBe("Evidence conflicts");
    expect(executiveConfidenceLabel("possible")).toBe("Early signal");
    expect(executiveConfidenceLabel("strongly_supported")).toBe("Strong evidence");
  });

  it("translates approval and urgency states", () => {
    expect(executiveApprovalLabel("L1_RECOMMENDATION")).toBe("Idea for review");
    expect(executiveApprovalLabel("L3_READY_FOR_APPROVAL")).toBe("Ready for your approval");
    expect(executiveUrgencyLabel("high")).toBe("Act soon");
  });

  it("translates data status and missing-source labels", () => {
    expect(executiveSourceModeLabel("PARTIAL_LIVE_DATA")).toBe("Some sources still connecting");
    expect(executiveMissingDataLabels(["email", "matchback"])).toEqual([
      "email campaign performance",
      "ad-to-order attribution",
    ]);
  });

  it("turns technical blockers into action-oriented explanations", () => {
    expect(executiveBlockerCopy("Evidence truth remains UNKNOWN and cannot support action certainty."))
      .toBe("We do not yet have enough verified data to act confidently.");
  });
});
