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
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      <div
        ref={panelRef}
        className={`relative w-full max-w-none ${maxWidthClassName} overflow-hidden border border-[var(--ui-border)] bg-[rgba(10,12,26,0.78)] shadow-2xl backdrop-blur-xl sm:rounded-3xl rounded-none sm:my-0 my-0 sm:max-h-[85vh] max-h-[100dvh] sm:h-auto h-[100dvh]`}
      >
        <div className="flex items-start justify-between gap-6 border-b border-white/5 px-5 py-4 sm:px-6 sm:py-5">
          <div className="min-w-0">
            <div id={titleId} className="truncate text-sm font-semibold text-zinc-50">
              {title}
            </div>
            {description ? (
              <div id={descriptionId} className="mt-1 text-sm text-zinc-400">
                {description}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-zinc-100 transition hover:border-white/20 hover:bg-white/[0.04]"
          >
            Close
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-5 sm:px-6">{children}</div>

        {footer ? <div className="border-t border-white/5 px-5 py-4 sm:px-6">{footer}</div> : null}
      </div>
    </div>,
    document.body
  );
}
