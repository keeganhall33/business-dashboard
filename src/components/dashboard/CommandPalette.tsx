"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "./ui/Modal";

export type CommandPaletteAction = {
  id: string;
  label: string;
  hint?: string;
  badge?: string;
  shortcut?: string;
  requiresConfirm?: boolean;
  confirmTitle?: string;
  confirmBody?: string;
  onRun: () => void;
};

type Props = {
  open: boolean;
  onClose: () => void;
  actions: CommandPaletteAction[];
};

export function CommandPalette({ open, onClose, actions }: Props) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const handleClose = useCallback(() => {
    setQuery("");
    setActiveIndex(0);
    setConfirmingId(null);
    onClose();
  }, [onClose]);

  const confirmingAction = useMemo(() => {
    if (!confirmingId) return null;
    return actions.find((action) => action.id === confirmingId) ?? null;
  }, [actions, confirmingId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return actions;
    return actions.filter((action) => action.label.toLowerCase().includes(q) || (action.hint ?? "").toLowerCase().includes(q));
  }, [actions, query]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (confirmingId) {
          setConfirmingId(null);
          return;
        }
        handleClose();
        return;
      }

      if (confirmingAction) {
        if (event.key === "Enter") {
          event.preventDefault();
          confirmingAction.onRun();
          setConfirmingId(null);
          handleClose();
        }
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((prev) => Math.min(prev + 1, Math.max(0, filtered.length - 1)));
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((prev) => Math.max(prev - 1, 0));
      }
      if (event.key === "Enter") {
        const action = filtered[activeIndex];
        if (!action) return;
        event.preventDefault();

        if (action.requiresConfirm) {
          setConfirmingId(action.id);
          return;
        }

        action.onRun();
        handleClose();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, filtered, activeIndex, confirmingAction, confirmingId, handleClose]);

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Command bar"
      description="Type to filter. Enter to run. Esc to close."
      maxWidthClassName="sm:max-w-2xl"
    >
      <div className="space-y-4">
        {confirmingAction ? (
          <div className="rounded-2xl border border-rose-900/40 bg-rose-950/15 p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.3em] text-rose-200">Confirm</div>
            <div className="mt-2 text-lg font-semibold text-zinc-50">
              {confirmingAction.confirmTitle ?? confirmingAction.label}
            </div>
            <div className="mt-2 text-sm text-zinc-300">
              {confirmingAction.confirmBody ?? "This action will run immediately."}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  confirmingAction.onRun();
                  setConfirmingId(null);
                  handleClose();
                }}
                className="rounded-xl border border-rose-700 bg-rose-900/20 px-4 py-2 text-sm font-semibold text-rose-100 hover:bg-rose-900/30"
              >
                Run now
              </button>
              <button
                type="button"
                onClick={() => setConfirmingId(null)}
                className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-sm font-semibold text-zinc-200 hover:border-white/15"
              >
                Cancel
              </button>
              <div className="ml-auto self-center text-xs text-zinc-500">Enter to run · Esc to cancel</div>
            </div>
          </div>
        ) : (
          <>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search actions…"
              className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-zinc-100 outline-none focus:border-white/20"
              autoFocus
            />

            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-2">
              {filtered.length ? (
                <div className="max-h-[50vh] overflow-y-auto">
                  {filtered.map((action, idx) => (
                    <button
                      key={action.id}
                      type="button"
                      onClick={() => {
                        if (action.requiresConfirm) {
                          setConfirmingId(action.id);
                          return;
                        }
                        action.onRun();
                        handleClose();
                      }}
                      className={`flex w-full items-center justify-between gap-4 rounded-xl px-3 py-2 text-left text-sm transition ${
                        idx === activeIndex ? "bg-white/[0.06] text-zinc-50" : "text-zinc-200 hover:bg-white/[0.04]"
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="truncate font-semibold">{action.label}</div>
                        {action.hint ? <div className="mt-0.5 truncate text-xs text-zinc-500">{action.hint}</div> : null}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {action.badge ? (
                          <span className="rounded-full border border-white/10 bg-black/30 px-2 py-1 text-[11px] text-zinc-300">
                            {action.badge}
                          </span>
                        ) : null}
                        {action.shortcut ? (
                          <span className="rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-[11px] text-zinc-500">
                            {action.shortcut}
                          </span>
                        ) : null}
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="px-3 py-8 text-center text-sm text-zinc-500">No matches.</div>
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

export function useJumpAction() {
  const router = useRouter();
  return (hash: string) => {
    router.push(`/dashboard${hash.startsWith("#") ? hash : `#${hash}`}`);
  };
}
