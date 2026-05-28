"use client";

import { ReactNode, useEffect, useState } from "react";

const CHEVRON_PATH = "M6 9l6 6 6-6";

type Props = {
  title: string;
  subtitle?: string;
  meta?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  storageKey?: string;
  tone?: "default" | "warning" | "success";
  context?: ReactNode;
  density?: "comfortable" | "compact";
};

export function DashboardSection({
  title,
  subtitle,
  meta,
  children,
  defaultOpen = true,
  storageKey,
  tone = "default",
  context,
  density = "comfortable"
}: Props) {
  const [open, setOpen] = useState(() => readStoredState(storageKey, defaultOpen));
  const sectionId = storageKey ? storageKey.replace(/[^a-zA-Z0-9_-]/g, "-") : undefined;

  useEffect(() => {
    if (!storageKey || typeof window === "undefined") return;
    window.sessionStorage.setItem(storageKey, open ? "open" : "closed");
  }, [open, storageKey]);

  const headerTone = toneClass(tone);

  return (
    <section
      id={sectionId}
      className={cn("ui-glass ui-glass-hover rounded-3xl", density === "compact" && "density-compact")}
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "flex w-full flex-col gap-2 border-b border-white/5 px-5 py-5 text-left transition sm:px-6 lg:px-8",
          headerTone,
          "hover:bg-white/[0.03]"
        )}
        aria-expanded={open}
      >
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="truncate text-xs font-semibold uppercase tracking-[0.3em] text-zinc-500">{title}</div>
            {subtitle ? <p className="mt-1 line-clamp-2 text-sm text-zinc-400">{subtitle}</p> : null}
          </div>
          <div className="flex items-center gap-4">
            {meta ? <div className="hidden text-sm text-zinc-200 md:block">{meta}</div> : null}
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
      </button>
      {open ? (
        <div className="px-5 py-7 sm:px-6 lg:px-8">
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
