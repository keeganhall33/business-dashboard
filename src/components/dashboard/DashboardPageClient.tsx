"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { DashboardOverviewResponse } from "@/lib/types/dashboard";
import type { AgentDashboardResponse } from "@/lib/types/agent";
import { DashboardShell } from "./DashboardShell";
import { DASHBOARD_REFRESH_EVENT } from "@/lib/dashboard/events";
import { DashboardToastHost } from "./ui/DashboardToastHost";
import {
  applyRangeSnapshot,
  createAppliedRangeSnapshot,
  createRangeRequestState,
  isCurrentRangeRequest,
  shouldStartRangeRequest,
  type AppliedRangeSnapshot,
  type RangeRequestState
} from "@/lib/dashboard/range-refresh";

function normalizeRange(data: DashboardOverviewResponse) {
  if (data.range.preset === "custom") {
    return `${data.range.preset}:${data.range.startDate}:${data.range.endDate}`;
  }
  return data.range.preset;
}

function buildTargetKey(preset: string, start?: string | null, end?: string | null) {
  if (preset === "custom" && start && end) {
    return `${preset}:${start}:${end}`;
  }
  return preset;
}

type Props = {
  initialData: DashboardOverviewResponse;
  agents: AgentDashboardResponse[];
};

export function DashboardPageClient({ initialData, agents }: Props) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [overview, setOverview] = useState(initialData);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshSignal, setRefreshSignal] = useState(0);

  const paramsKey = useMemo(() => searchParams.toString(), [searchParams]);
  const targetConfig = useMemo(() => {
    const params = new URLSearchParams(paramsKey);
    const preset = (params.get("range") ?? "30d").toLowerCase();
    const start = params.get("start");
    const end = params.get("end");
    const search = new URLSearchParams();
    search.set("range", preset);
    if (preset === "custom" && start && end) {
      search.set("start", start);
      search.set("end", end);
    }
    return {
      preset,
      start,
      end,
      key: buildTargetKey(preset, start, end),
      queryString: search.toString()
    };
  }, [paramsKey]);

  const currentKey = normalizeRange(overview);
  const [, startRefreshTransition] = useTransition();
  const appliedRangeRef = useRef<AppliedRangeSnapshot | null>(null);
  const inFlightRef = useRef<RangeRequestState | null>(null);
  if (appliedRangeRef.current == null) {
    appliedRangeRef.current = createAppliedRangeSnapshot(currentKey, paramsKey);
  }

  useEffect(() => {
    function handleManualRefresh() {
      setRefreshSignal(Date.now());
    }

    window.addEventListener(DASHBOARD_REFRESH_EVENT, handleManualRefresh);
    return () => window.removeEventListener(DASHBOARD_REFRESH_EVENT, handleManualRefresh);
  }, []);

  useEffect(() => {
    const appliedRange = appliedRangeRef.current!;
    const needsRefresh = shouldStartRangeRequest(appliedRange, inFlightRef.current, targetConfig.key, refreshSignal);

    if (!needsRefresh) {
      return undefined;
    }

    const controller = new AbortController();
    const requestState = createRangeRequestState(targetConfig.key, refreshSignal);
    inFlightRef.current = requestState;

    startRefreshTransition(() => {
      setIsRefreshing(true);
      setError(null);
    });

    fetch(`/api/dashboard/overview?${targetConfig.queryString}`, {
      cache: "no-store",
      signal: controller.signal
    })
      .then(async (response) => {
        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || "Failed to refresh metrics");
        }
        return response.json();
      })
      .then((payload: DashboardOverviewResponse) => {
        if (!isCurrentRangeRequest(inFlightRef.current, requestState.token)) {
          return;
        }
        applyRangeSnapshot(appliedRangeRef.current!, targetConfig.key, refreshSignal, paramsKey);
        inFlightRef.current = null;
        setOverview(payload);
        setError(null);
        startRefreshTransition(() => {
          setIsRefreshing(false);
        });
      })
      .catch((err) => {
        if (err.name === "AbortError") return;
        if (!isCurrentRangeRequest(inFlightRef.current, requestState.token)) {
          return;
        }
        inFlightRef.current = null;
        console.error("Failed to refresh dashboard data", err);
        setError("Could not refresh the dashboard with the selected date range.");
        const appliedQuery = appliedRangeRef.current?.queryString ?? "";
        if (appliedQuery !== paramsKey) {
          const target = appliedQuery ? `${pathname}?${appliedQuery}` : pathname;
          router.replace(target, { scroll: false });
        }
        startRefreshTransition(() => {
          setIsRefreshing(false);
        });
      });

    return () => {
      controller.abort();
      if (isCurrentRangeRequest(inFlightRef.current, requestState.token)) {
        inFlightRef.current = null;
      }
    };
  }, [paramsKey, pathname, refreshSignal, router, startRefreshTransition, targetConfig.key, targetConfig.queryString]);

  return (
    <>
      <DashboardToastHost />
      <div className="space-y-4">
        {(isRefreshing || error) && (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 px-4 py-3 text-sm text-zinc-300">
            {isRefreshing && !error ? "Refreshing data…" : null}
            {error ? error : null}
          </div>
        )}
        <DashboardShell data={overview} agents={agents} />
      </div>
    </>
  );
}
