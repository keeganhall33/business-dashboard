import type { DeliverableLink } from "@/lib/types/dashboard";
import { resolveDeliverableUrl } from "@/lib/domain/deliverables";

type Props = {
  attachments?: DeliverableLink[] | null;
  tone?: "emerald" | "zinc" | "amber";
  variant?: "chips" | "previews";
};

export function DeliverableAttachmentList({ attachments, tone = "zinc", variant = "chips" }: Props) {
  if (!attachments || attachments.length === 0) return null;

  const baseStyles =
    tone === "emerald"
      ? "border-emerald-500/40 text-emerald-100 hover:bg-emerald-500/10"
      : tone === "amber"
      ? "border-amber-400/40 text-amber-100 hover:bg-amber-500/10"
      : "border-zinc-500/40 text-zinc-100 hover:bg-zinc-800";


  if (variant === "previews") {
    return (
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {attachments.map((attachment, index) => {
          const isImage = looksLikeImage(attachment.url);
          return (
            <a
              key={`${attachment.url}-${attachment.label}-${index}`}
              href={resolveDeliverableUrl(attachment.url)}
              target="_blank"
              rel="noreferrer noopener"
              className={`group flex items-center gap-3 rounded-2xl border px-3 py-2 transition ${baseStyles}`}
            >
              <div className="h-12 w-12 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950">
                {isImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={attachment.url} alt={attachment.label} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-zinc-400">DOC</div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-semibold text-zinc-100 group-hover:text-white">{attachment.label}</div>
                <div className="truncate text-[11px] text-zinc-500">{stripProtocol(attachment.url)}</div>
              </div>
              <svg className="h-4 w-4 text-zinc-400" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                  d="M7.5 12.5L12.5 7.5M12.5 7.5H8M12.5 7.5V12"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </a>
          );
        })}
      </div>
    );
  }

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {attachments.map((attachment, index) => (
        <a
          key={`${attachment.url}-${attachment.label}-${index}`}
          href={resolveDeliverableUrl(attachment.url)}
          target="_blank"
          rel="noreferrer noopener"
          className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold transition ${baseStyles}`}
        >
          <span>{attachment.label}</span>
          <svg className="h-3 w-3" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M7.5 12.5L12.5 7.5M12.5 7.5H8M12.5 7.5V12"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </a>
      ))}
    </div>
  );
}

function looksLikeImage(url: string) {
  return /\.(png|jpe?g|gif|webp|avif|svg)(\?|#|$)/i.test(url);
}

function stripProtocol(url: string) {
  return url.replace(/^https?:\/\//, "");
}
