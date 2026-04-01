"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { DashboardOverviewResponse } from "@/lib/types/dashboard";
import type { AgentDashboardResponse } from "@/lib/types/agent";
import { DashboardShell } from "./DashboardShell";

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
  const [overview, setOverview] = useState(initialData);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const paramsKey = useMemo(() => searchParams.toString(), [searchParams]);
  const targetConfig = useMemo(() => {
    const params = new URLSearchParams(paramsKey);
    const preset = (params.get("range") ?? "30d").toLowerCase();
    const start = params.get("start");
    const end = params.get("end");
    return {
      preset,
      start,
      end,
      key: buildTargetKey(preset, start, end),
      query: (() => {
        const search = new URLSearchParams();
        search.set("range", preset);
        if (preset === "custom" && start && end) {
          search.set("start", start);
          search.set("end", end);
        }
        return search;
      })()
    };
  }, [paramsKey]);

  const currentKey = normalizeRange(overview);
  const needsRefresh = targetConfig.key !== currentKey;

  useEffect(() => {
    if (!needsRefresh) {
      setIsRefreshing(false);
      setError(null);
    }
  }, [needsRefresh]);

  useEffect(() => {
    if (!needsRefresh) {
      return undefined;
    }

    const controller = new AbortController();
    setIsRefreshing(true);
    setError(null);

    fetch(`/api/dashboard/overview?${targetConfig.query.toString()}`, {
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
          setIsRefreshing(false);
        }
      });

    return () => controller.abort();
  }, [needsRefresh, targetConfig]);

  return (
    <div className="space-y-4">
      {(isRefreshing || error) && (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 px-4 py-3 text-sm text-zinc-300">
          {isRefreshing && !error ? "Refreshing data…" : null}
          {error ? error : null}
        </div>
      )}
      <DashboardShell data={overview} agents={agents} />
    </div>
  );
}
