import type { TaskSummary } from "@/lib/types/dashboard";

export type AgentConversationMessage = {
  id: string;
  senderType: string;
  senderKey: string | null;
  messageType: string;
  body: string;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
};

export type AgentPlanListItem = {
  id: string;
  title: string;
  status: string;
  summary: string | null;
  submittedAt: string;
  approvedAt: string | null;
  approvedBy: string | null;
};

export type AgentDashboardResponse = {
  ok: boolean;
  agent: {
    agentKey: string;
    displayName: string;
    roleTitle: string;
    mandate: string;
    decisionScope: string;
  };
  ownedMetrics: Array<{
    metricKey: string;
    metricName: string;
    currentValue: number;
    targetValue: number;
    status: string;
    unit: string | null;
  }>;
  recentUpdates: Array<{
    id: string;
    updateType: string;
    title: string;
    summary: string;
    detailMd: string | null;
    priority: string;
    createdAt: string;
  }>;
  openTasks: TaskSummary[];
  completedTasks: TaskSummary[];
  weeklyOutputRequirements: { weekly: string[] };
  planQueue: {
    pending: AgentPlanListItem | null;
    recent: AgentPlanListItem[];
  };
  conversation: {
    threadId: string;
    title: string;
    messages: AgentConversationMessage[];
  };
};
