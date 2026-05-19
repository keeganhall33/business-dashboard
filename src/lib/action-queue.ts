import { ActionQueue } from "@/lib/types/dashboard";

export type QuickActionItem = {
  id: string;
  actionType: "task" | "plan";
  title: string;
  summary: string | null;
  createdAt: string | null;
  actor: string | null | undefined;
  priority?: string | null;
};

export function buildQuickActions(actionQueue: ActionQueue, limit = 4): QuickActionItem[] {
  const actionableItems: QuickActionItem[] = [];

  actionableItems.push(
    ...actionQueue.needsApprovalTasks.items
      .filter((item) => item.itemType === "task")
      .map((item) => ({
        id: item.id,
        actionType: "task" as const,
        title: item.title,
        summary: item.summary,
        createdAt: item.createdAt,
        actor: item.actor,
        priority: item.priority ?? null
      }))
  );

  actionableItems.push(
    ...actionQueue.pendingPlans.items
      .filter((item) => item.itemType === "plan")
      .map((item) => ({
        id: item.id,
        actionType: "plan" as const,
        title: item.title,
        summary: item.summary,
        createdAt: item.createdAt,
        actor: item.actor,
        priority: item.priority ?? null
      }))
  );

  return actionableItems
    .sort((a, b) => {
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : Number.POSITIVE_INFINITY;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : Number.POSITIVE_INFINITY;
      return aTime - bTime;
    })
    .slice(0, limit);
}
