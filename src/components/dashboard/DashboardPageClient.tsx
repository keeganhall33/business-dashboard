"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { DashboardOverviewResponse } from "@/lib/types/dashboard";
import { DashboardShell } from "./DashboardShell";
import { DASHBOARD_REFRESH_EVENT } from "@/lib/dashboard/events";
import { DashboardToastHost } from "./ui/DashboardToastHost";

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
};

export function DashboardPageClient({ initialData }: Props) {
  const searchParams = useSearchParams();
  const [overview, setOverview] = useState(initialData);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshSignal, setRefreshSignal] = useState(0);

  const paramsKey = useMemo(() => searchParams.toString(), [searchParams]);
  const targetConfig = useMemo(() => {
    const params = new URLSearchParams(paramsKey);
    const preset = (params.get("range") ?? "7d").toLowerCase();
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
  const lastAppliedRef = useRef({ key: currentKey, signal: 0 });

  useEffect(() => {
    function handleManualRefresh() {
      setRefreshSignal(Date.now());
    }

    window.addEventListener(DASHBOARD_REFRESH_EVENT, handleManualRefresh);
    return () => window.removeEventListener(DASHBOARD_REFRESH_EVENT, handleManualRefresh);
  }, []);

  useEffect(() => {
    const shouldRefresh =
      targetConfig.key !== lastAppliedRef.current.key || refreshSignal !== lastAppliedRef.current.signal;

    if (!shouldRefresh) {
      return undefined;
    }

    const controller = new AbortController();
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
        setOverview(payload);
        setError(null);
      })
      .catch((err) => {
        if (err.name === "AbortError") return;
        console.error("Failed to refresh dashboard data", err);
        setError("Could not refresh the dashboard with the selected date range.");
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          lastAppliedRef.current = { key: targetConfig.key, signal: refreshSignal };
          startRefreshTransition(() => {
            setIsRefreshing(false);
          });
        }
      });

    return () => controller.abort();
  }, [refreshSignal, startRefreshTransition, targetConfig.key, targetConfig.queryString]);

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
        <DashboardShell data={overview} />
      </div>
    </>
  );
}
