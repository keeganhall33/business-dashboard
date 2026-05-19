"use client";

import { useMemo } from "react";
import { Modal } from "./ui/Modal";
import { DeliverableAttachmentList } from "./DeliverableAttachmentList";
import { StatusChip } from "./ui/StatusChip";

type Attachment = {
  label: string;
  url: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  body?: string | null;
  attachments?: Attachment[] | null;
  metaChips?: Array<{ label: string; tone?: "zinc" | "sky" | "amber" | "emerald" | "rose" }>;
};

export function ViewWorkModal({ open, onClose, title, subtitle, body, attachments, metaChips }: Props) {
  const normalizedBody = useMemo(() => (body ?? "").trim(), [body]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={subtitle}
      maxWidthClassName="sm:max-w-4xl"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {metaChips?.map((chip) => (
              <StatusChip key={chip.label} label={chip.label} tone={chip.tone ?? "zinc"} />
            ))}
          </div>
          <div className="text-xs text-zinc-500">Tip: tap any evidence link to open in a new tab.</div>
        </div>
      }
    >
      <div className="space-y-5">
        {normalizedBody ? (
          <div className="rounded-2xl border border-zinc-900 bg-zinc-950/60 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-zinc-500">Work summary</div>
            <pre className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-zinc-200">{normalizedBody}</pre>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-950/40 p-4 text-sm text-zinc-400">
            No artifact text yet. When agents attach a deliverable summary, it will render here.
          </div>
        )}

        <div className="rounded-2xl border border-zinc-900 bg-zinc-950/60 p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-zinc-500">Evidence</div>
          {attachments?.length ? (
            <DeliverableAttachmentList attachments={attachments} variant="previews" />
          ) : (
            <div className="mt-3 text-sm text-zinc-400">No files/links attached yet.</div>
          )}
        </div>
      </div>
    </Modal>
  );
}
