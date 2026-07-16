import type { ActionQueueItem } from "../types/dashboard.ts";

export type MinimalTaskRecord = {
  id: string;
  agent_key: string;
  requires_approval: boolean;
  approved_by_user: boolean | null;
};

export function shouldTriggerTaskAutomation(existing: MinimalTaskRecord, updated: { approved_by_user: boolean | null }, approvedByUser: boolean) {
  return (
    approvedByUser === true &&
    existing.requires_approval &&
    !existing.approved_by_user &&
    Boolean(updated.approved_by_user)
  );
}

type ExecutableApprovalItem = ActionQueueItem & { title: string; summary: string; actor: string };

export function isExecutableApprovalItem(item: ActionQueueItem): item is ExecutableApprovalItem {
  if (!item) return false;
  if (!item.title || !item.summary || !item.actor) return false;
  if (item.itemType === "task" || item.itemType === "plan") return true;
  if (item.itemType === "decision" || item.itemType === "invoice") return Boolean(item.summary);
  return false;
}
