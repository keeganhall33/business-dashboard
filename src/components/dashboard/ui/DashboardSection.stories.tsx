import type { Meta, StoryObj } from "@storybook/react";
import { DashboardSection } from "./DashboardSection";

const meta: Meta<typeof DashboardSection> = {
  title: "Dashboard/DashboardSection",
  component: DashboardSection,
  args: {
    title: "Command Center",
    subtitle: "Survival strip & live directives",
    description: "Focus on near-term actions before diving into the rest of the dashboard.",
    meta: (
      <div>
        <div className="text-[10px] uppercase tracking-[0.2em] text-emerald-300">Live</div>
        <div className="text-xs text-zinc-400">3 actions • 2 risks</div>
      </div>
    ),
    children: (
      <div className="space-y-3">
        <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4 text-sm text-zinc-200">Survival strip placeholder</div>
        <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4 text-sm text-zinc-200">Action queue placeholder</div>
      </div>
    )
  }
};

export default meta;

export const Default: StoryObj<typeof DashboardSection> = {};

export const Collapsed: StoryObj<typeof DashboardSection> = {
  args: {
    defaultOpen: false,
    actions: <button className="rounded-full border border-white/10 px-3 py-1 text-xs text-zinc-300">Refresh</button>
  }
};
