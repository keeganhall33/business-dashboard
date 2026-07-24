import type { PreparedAction, PreparedAssetType } from "@/lib/types/dashboard";

export const preparedAssetTypeLabels: Record<PreparedAssetType, string> = {
  content_post_draft: "Content post draft",
  meta_creative_brief: "Meta creative brief",
  email_draft: "Email draft",
  checkout_audit_brief: "Checkout audit brief"
};

export function defaultAssetTypeForAction(action: PreparedAction): PreparedAssetType {
  switch (action.category) {
    case "meta":
      return "meta_creative_brief";
    case "email":
      return "email_draft";
    case "website":
      return "checkout_audit_brief";
    default:
      return "content_post_draft";
  }
}
