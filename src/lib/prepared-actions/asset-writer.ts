import type { PreparedAction, PreparedActionAsset, PreparedAssetType } from "@/lib/types/dashboard";
import { preparedAssetTypeLabels } from "./asset-types";

const MAX_EVIDENCE_ROWS = 3;

function evidenceSummary(action: PreparedAction) {
  const rows = action.evidence.slice(0, MAX_EVIDENCE_ROWS);
  if (!rows.length) return "No supporting metrics attached.";
  return rows
    .map((row) => {
      const value = row.value ? ` — ${row.value}` : "";
      return `• ${row.label}${value}`;
    })
    .join("\n");
}

function sharedContext(action: PreparedAction) {
  const dataLight = action.dataLight ? " | Data light" : "";
  return `Source panel: ${action.sourcePanel}\nRisk: ${action.riskLevel} | Confidence: ${action.confidence}${dataLight}`;
}

function truncateParagraph(value: string, max = 800) {
  return value.length > max ? `${value.slice(0, max - 1).trim()}…` : value;
}

function buildContentPost(action: PreparedAction) {
  const bullets = evidenceSummary(action);
  return truncateParagraph(
    [
      `Hook: ${action.title}`,
      "Body:",
      `- Category: ${action.category}`,
      `- Evidence focus:\n${bullets}`,
      "CTA: Invite collectors to reply for early access or DM for proof-of-work."
    ].join("\n\n")
  );
}

function buildMetaBrief(action: PreparedAction) {
  const bullets = evidenceSummary(action);
  return truncateParagraph(
    [
      "Objective: Reset creative fatigue and test a fresh hook before scaling spend.",
      `Hook concept: ${action.title}`,
      `Source panel: ${action.sourcePanel}`,
      `Proof points:\n${bullets}`,
      "Guardrails: keep premium tone, hero the art, no discount framing."
    ].join("\n\n")
  );
}

function buildEmailDraft(action: PreparedAction) {
  const headline = action.title;
  const bullets = evidenceSummary(action);
  const body = truncateParagraph(
    [
      `Subject: ${headline}`,
      `Preview: ${headline} — sourced from ${action.sourcePanel}`,
      "Body:",
      `Highlight:${bullets ? `\n${bullets}` : "\n• Evidence pending."}`,
      "CTA: Reply to reserve / claim, or tap the featured link."
    ].join("\n\n"),
    900
  );
  return body;
}

function buildCheckoutBrief(action: PreparedAction) {
  const bullets = action.evidence
    .slice(0, MAX_EVIDENCE_ROWS)
    .map((row) => `□ Validate ${row.label}${row.value ? ` (${row.value})` : ""}`)
    .join("\n");
  return truncateParagraph(
    [
      "Focus: remove friction in cart → checkout.",
      `Source: ${action.sourcePanel}`,
      "Checklist:",
      bullets || "□ Document current drop-off proof"
    ].join("\n\n"),
    700
  );
}

function buildAssetValue(action: PreparedAction, assetType: PreparedAssetType) {
  switch (assetType) {
    case "meta_creative_brief":
      return buildMetaBrief(action);
    case "email_draft":
      return buildEmailDraft(action);
    case "checkout_audit_brief":
      return buildCheckoutBrief(action);
    default:
      return buildContentPost(action);
  }
}

export function generatePreparedActionAsset(
  action: PreparedAction,
  assetType: PreparedAssetType
): PreparedActionAsset {
  const generatedAt = new Date().toISOString();
  const body = [buildAssetValue(action, assetType), sharedContext(action)].join("\n\n");
  return {
    assetType,
    label: preparedAssetTypeLabels[assetType],
    value: body,
    generatedAt
  };
}
