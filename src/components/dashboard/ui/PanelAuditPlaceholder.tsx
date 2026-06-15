import { PanelWrapper } from "./PanelWrapper";
import { PanelDataMode } from "./PanelModeBadge";

type Props = {
  title: string;
  detail: string;
  mode?: PanelDataMode;
};

export function PanelAuditPlaceholder({ title, detail, mode = "FALLBACK" }: Props) {
  return (
    <PanelWrapper mode={mode}>
      <section className="ui-glass ui-glass-hover space-y-3 rounded-3xl border border-white/10 bg-white/[0.03] p-6">
        <div className="text-xs font-semibold uppercase tracking-[0.35em] text-zinc-500">{title}</div>
        <p className="text-sm text-zinc-300">{detail}</p>
      </section>
    </PanelWrapper>
  );
}
