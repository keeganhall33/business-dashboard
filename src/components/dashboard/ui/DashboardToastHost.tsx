"use client";

import { useEffect, useState } from "react";
import { DASHBOARD_TOAST_EVENT, type DashboardToastPayload } from "@/lib/dashboard/toast";

const DEFAULT_TIMEOUT_MS = 4000;

type Tone = "info" | "success" | "error" | "warning";

type ToastItem = {
  id: string;
  tone: Tone;
  title: string;
  description?: string;
  expiresAt: number;
};

const toneClass: Record<Tone, string> = {
  info: "border-sky-400/40 bg-sky-500/10 text-sky-50",
  success: "border-emerald-400/40 bg-emerald-500/10 text-emerald-50",
  error: "border-rose-400/40 bg-rose-500/10 text-rose-50",
  warning: "border-amber-400/40 bg-amber-500/10 text-amber-50"
};

export function DashboardToastHost() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    function handleEvent(event: Event) {
      const custom = event as CustomEvent<Required<DashboardToastPayload>>;
      const payload = custom.detail;
      const tone: Tone = (payload?.tone ?? "info") as Tone;
      const id = payload?.id ?? crypto.randomUUID();
      const toast: ToastItem = {
        title: payload?.title ?? "Notification",
        description: payload?.description,
        tone,
        id,
        expiresAt: Date.now() + DEFAULT_TIMEOUT_MS
      };
      setToasts((current) => [...current, toast]);
    }

    window.addEventListener(DASHBOARD_TOAST_EVENT, handleEvent);
    return () => window.removeEventListener(DASHBOARD_TOAST_EVENT, handleEvent);
  }, []);

  useEffect(() => {
    if (!toasts.length) return;
    const interval = window.setInterval(() => {
      const now = Date.now();
      setToasts((current) => current.filter((toast) => toast.expiresAt > now));
    }, 500);
    return () => window.clearInterval(interval);
  }, [toasts.length]);

  if (!toasts.length) return null;

  return (
    <div className="pointer-events-none fixed inset-x-4 top-4 z-[200] space-y-3 sm:right-6 sm:left-auto sm:w-80">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto rounded-2xl border px-4 py-3 text-sm shadow-lg backdrop-blur ${toneClass[toast.tone]}`}
        >
          <div className="font-semibold">{toast.title}</div>
          {toast.description ? <div className="mt-1 text-xs text-white/80">{toast.description}</div> : null}
        </div>
      ))}
    </div>
  );
}
