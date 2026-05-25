export const DASHBOARD_REFRESH_EVENT = "dashboard:refresh" as const;

export type DashboardRefreshDetail = {
  reason?: string;
};

export function requestDashboardRefresh(detail?: DashboardRefreshDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(DASHBOARD_REFRESH_EVENT, { detail: detail ?? {} }));
}
