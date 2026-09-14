"use client";

import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";

type Props = {
  open: boolean;
  title: string;
  description?: string;
  children: React.ReactNode;
  onClose: () => void;
  footer?: React.ReactNode;
  maxWidthClassName?: string;
};

export function Modal({
  open,
  title,
  description,
  children,
  onClose,
  footer,
  maxWidthClassName = "sm:max-w-3xl"
}: Props) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("keydown", onKeyDown);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // basic focus hint (no full trap) — keep UX acceptable without extra deps
    const focusTarget = panelRef.current?.querySelector<HTMLElement>("button,[href],input,select,textarea,[tabindex]:not([tabindex='-1'])");
    focusTarget?.focus?.();

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  const isClient = typeof window !== "undefined";
  if (!open || !isClient) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[2000] flex items-end justify-center overflow-y-auto p-0 sm:items-start sm:px-4 sm:py-10"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="absolute inset-0 bg-slate-950/30 backdrop-blur-sm" onMouseDown={onClose} />

      <div
        ref={panelRef}
        className={`relative w-full max-w-none ${maxWidthClassName} overflow-hidden border border-slate-200 bg-white shadow-2xl sm:rounded-3xl rounded-none sm:my-0 my-0 sm:max-h-[85vh] max-h-[100dvh] sm:h-auto h-[100dvh]`}
      >
        <div className="flex items-start justify-between gap-6 border-b border-slate-200 px-5 py-4 sm:px-6 sm:py-5">
          <div className="min-w-0">
            <div id={titleId} className="truncate text-sm font-semibold text-slate-950">
              {title}
            </div>
            {description ? (
              <div id={descriptionId} className="mt-1 text-sm text-slate-600">
                {description}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-700 transition hover:bg-slate-50"
          >
            Close
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-5 sm:px-6">{children}</div>

        {footer ? <div className="border-t border-slate-200 px-5 py-4 sm:px-6">{footer}</div> : null}
      </div>
    </div>,
    document.body
  );
}
