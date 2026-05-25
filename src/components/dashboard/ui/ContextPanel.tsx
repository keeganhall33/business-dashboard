import { ReactNode } from "react";

export type ContextItem = {
  label: string;
  value: ReactNode;
  supportingText?: ReactNode;
};

type Props = {
  title: string;
  items: ContextItem[];
};

export function ContextPanel({ title, items }: Props) {
  if (!items.length) return null;

  return (
    <div className="context-card">
      <h4>{title}</h4>
      <ul className="context-list">
        {items.map((item) => (
          <li key={item.label}>
            <span className="context-label">{item.label}</span>
            <span className="context-value">{item.value}</span>
            {item.supportingText ? <span className="text-xs text-zinc-500">{item.supportingText}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
