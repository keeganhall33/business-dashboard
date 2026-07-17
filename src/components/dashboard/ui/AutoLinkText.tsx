import clsx from "clsx";
import { splitTextByUrls } from "@/lib/text/links";

export function AutoLinkText({ value, className }: { value: string; className?: string }) {
  if (!value) {
    return <span className={clsx(className, "text-zinc-500")}>—</span>;
  }

  const segments = splitTextByUrls(value);
  return (
    <span className={className}>
      {segments.map((segment, index) => {
        if (segment.type === "link") {
          return (
            <a
              key={`${segment.value}-${index}`}
              href={segment.value}
              target="_blank"
              rel="noreferrer noopener"
              className="underline decoration-dotted underline-offset-4 text-sky-300 hover:text-sky-100"
            >
              {segment.value.replace(/^https?:\/\//, "")}
            </a>
          );
        }
        return <span key={`text-${index}`}>{segment.value}</span>;
      })}
    </span>
  );
}
