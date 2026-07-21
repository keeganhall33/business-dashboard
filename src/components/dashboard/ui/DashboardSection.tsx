"use client";

import { ReactNode, useEffect, useId, useMemo, useState } from "react";

const CHEVRON_PATH = "M6 9l6 6 6-6";

type Props = {
  /** Optional DOM id for the wrapping section */
  id?: string;
  title: string;
  subtitle?: string;
  description?: string;
  meta?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  storageKey?: string;
  tone?: "default" | "warning" | "success";
  context?: ReactNode;
  density?: "comfortable" | "compact";
  onToggle?: (nextOpen: boolean) => void;
};

export function DashboardSection({
  id,
  title,
  subtitle,
  description,
  meta,
  actions,
  children,
  defaultOpen = true,
  storageKey,
  tone = "default",
  context,
  density = "comfortable",
  onToggle
}: Props) {
  const generatedId = useId();
  const sectionId = id ?? (storageKey ? `dashboard-section-${storageKey}` : undefined);
  const headingId = `${generatedId}-heading`;
  const contentId = `${generatedId}-content`;
  const [open, setOpen] = useState(() => readStoredState(storageKey, defaultOpen));

  const handleToggle = () => {
    setOpen((value) => {
      const next = !value;
      onToggle?.(next);
      return next;
    });
  };

  useEffect(() => {
    if (!storageKey || typeof window === "undefined") return;
    window.sessionStorage.setItem(storageKey, open ? "open" : "closed");
  }, [open, storageKey]);

  const headerTone = toneClass(tone);
  const regionLabel = useMemo(() => subtitle ?? description ?? title, [subtitle, description, title]);

  return (
    <section
      id={sectionId}
      className={cn("ui-glass ui-glass-hover rounded-3xl", density === "compact" && "density-compact")}
      data-state={open ? "open" : "collapsed"}
    >
      <button
        type="button"
        onClick={handleToggle}
        className={cn(
          "flex w-full flex-col gap-2 border-b border-white/5 px-5 py-5 text-left transition sm:px-6 lg:px-8",
          headerTone,
          "hover:bg-white/[0.03]"
        )}
        aria-expanded={open}
        aria-controls={contentId}
        id={headingId}
      >
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="truncate text-xs font-semibold uppercase tracking-[0.3em] text-zinc-500">
              <span>{title}</span>
            </div>
            {subtitle ? <p className="mt-1 line-clamp-2 text-sm text-zinc-400">{subtitle}</p> : null}
            {description ? <p className="mt-1 text-sm text-zinc-500">{description}</p> : null}
          </div>
          <div className="flex items-center gap-4">
            {meta ? <div className="hidden text-right text-sm text-zinc-200 md:block">{meta}</div> : null}
            {actions ? <div className="hidden md:block">{actions}</div> : null}
            <span
              className={cn(
                "inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.02] text-zinc-200 ui-glass-hover",
                open ? "rotate-0" : "-rotate-90",
                "transition-transform"
              )}
            >
              <svg viewBox="0 0 24 24" width={20} height={20} className="text-zinc-300">
                <path d={CHEVRON_PATH} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </div>
        </div>
        {meta ? <div className="text-sm text-zinc-400 md:hidden">{meta}</div> : null}
        {actions ? <div className="text-sm md:hidden">{actions}</div> : null}
      </button>
      {open ? (
        <div
          id={contentId}
          role="region"
          aria-labelledby={headingId}
          aria-label={regionLabel}
          className="px-5 py-7 sm:px-6 lg:px-8"
        >
          {context ? (
            <div className="layout-with-rail">
              <div className="flex-1 space-y-6">{children}</div>
              <aside className="context-rail">{context}</aside>
            </div>
          ) : (
            children
          )}
        </div>
      ) : null}
    </section>
  );
}

function toneClass(tone: Props["tone"]) {
  switch (tone) {
    case "warning":
      return "bg-gradient-to-r from-amber-500/[0.10] to-transparent";
    case "success":
      return "bg-gradient-to-r from-emerald-400/[0.08] to-transparent";
    default:
      return "bg-gradient-to-r from-white/[0.02] to-transparent";
  }
}

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function readStoredState(storageKey: string | undefined, fallback: boolean) {
  if (!storageKey || typeof window === "undefined") return fallback;
  const stored = window.sessionStorage.getItem(storageKey);
  if (stored === "open" || stored === "closed") {
    return stored === "open";
  }

  // Mobile-first: default collapsed unless the user previously opened it.
  // Keep desktop behavior intact.
  try {
    if (window.matchMedia && window.matchMedia("(max-width: 640px)").matches) {
      return false;
    }
  } catch {
    // ignore
  }

  return fallback;
}
