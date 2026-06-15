import { ReactNode } from "react";
import { formatRelativeTimeFromNow } from "@/lib/date";
import { PanelModeBadge, PanelDataMode } from "./PanelModeBadge";

export type PanelWrapperProps = {
  mode: PanelDataMode;
  refreshedAtIso?: string | null;
  children: ReactNode;
};

export function PanelWrapper({ mode, refreshedAtIso, children }: PanelWrapperProps) {
  return (
    <div className="relative">
      <div className="pointer-events-none absolute right-4 top-4 z-10 flex flex-col items-end gap-1">
        <PanelModeBadge mode={mode} />
        {refreshedAtIso ? (
          <span className="text-[10px] font-semibold uppercase tracking-[0.3em] text-zinc-500">
            Refreshed {formatRelativeTimeFromNow(refreshedAtIso)}
          </span>
        ) : null}
      </div>
      {children}
    </div>
  );
}
