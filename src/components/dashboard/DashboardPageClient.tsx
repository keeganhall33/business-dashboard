"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { DashboardOverviewResponse } from "@/lib/types/dashboard";
import type { AgentDashboardResponse } from "@/lib/types/agent";
import { DashboardShell } from "./DashboardShell";
import { DASHBOARD_REFRESH_EVENT } from "@/lib/dashboard/events";
import { DashboardToastHost } from "./ui/DashboardToastHost";

function normalizeRange(data: DashboardOverviewResponse) {
  if (data.range.preset === "custom") {
    return `${data.range.preset}:${data.range.startDate}:${data.range.endDate}`;
  }
  return data.range.preset;
}

function isIsoDate(value: string | null) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function isKnownRangePreset(value: string) {
  return [
    "today",
    "yesterday",
    "7d",
    "30d",
    "90d",
    "month_to_date",
    "previous_month",
    "year_to_date",
    "custom"
  ].includes(value);
}

type Props = {
  initialData: DashboardOverviewResponse;
  agents: AgentDashboardResponse[];
};

export function DashboardPageClient({ initialData, agents }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [overview, setOverview] = useState(initialData);

  const paramsKey = useMemo(() => searchParams.toString(), [searchParams]);

  useEffect(() => {
    setOverview(initialData);
  }, [initialData]);

  useEffect(() => {
    function handleManualRefresh() {
      router.refresh();
    }

    window.addEventListener(DASHBOARD_REFRESH_EVENT, handleManualRefresh);
    return () => window.removeEventListener(DASHBOARD_REFRESH_EVENT, handleManualRefresh);
  }, [router]);

  useEffect(() => {
    // Canonicalize only when the requested query is invalid.
    // On mobile Safari/WebKit, eager canonicalization can race the App Router RSC update,
    // causing the URL to "snap back" to the prior range even after a successful tap.
    const canonical = normalizeRange(overview);
    const params = new URLSearchParams(paramsKey);
    const requestedPreset = (params.get("range") ?? "30d").toLowerCase();
    const requestedKey =
      requestedPreset === "custom" && params.get("start") && params.get("end")
        ? `custom:${params.get("start")}:${params.get("end")}`
        : requestedPreset;

    const hasValidCustom = requestedPreset === "custom" && isIsoDate(params.get("start")) && isIsoDate(params.get("end"));
    const isValidRequest = isKnownRangePreset(requestedPreset) && (requestedPreset !== "custom" || hasValidCustom);

    if (!isValidRequest && canonical !== requestedKey) {
      params.set("range", overview.range.preset);
      if (overview.range.preset === "custom") {
        params.set("start", overview.range.startDate);
        params.set("end", overview.range.endDate);
      } else {
        params.delete("start");
        params.delete("end");
      }
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    }
  }, [overview, paramsKey, pathname, router]);

  return (
    <>
      <DashboardToastHost />
      <DashboardShell data={overview} agents={agents} />
    </>
  );
}
