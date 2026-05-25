export const DASHBOARD_TOAST_EVENT = "dashboard:toast" as const;

export type DashboardToastPayload = {
  id?: string;
  tone?: "info" | "success" | "error" | "warning";
  title: string;
  description?: string;
};

export function publishDashboardToast(payload: DashboardToastPayload) {
  if (typeof window === "undefined") return;
  const detail = { ...payload, id: payload.id ?? crypto.randomUUID() };
  window.dispatchEvent(new CustomEvent(DASHBOARD_TOAST_EVENT, { detail }));
}
