import type { Meta, StoryObj } from "@storybook/react";
import { TrendCard } from "./TrendCard";

const meta: Meta<typeof TrendCard> = {
  title: "Dashboard/TrendCard",
  component: TrendCard,
  tags: ["autodocs"],
  args: {
    label: "Sessions",
    value: "42,120",
    series: [100, 120, 115, 130, 140, 150, 170, 190, 210, 220],
    tone: "sky"
  }
};

export default meta;
type Story = StoryObj<typeof TrendCard>;

export const Default: Story = {};

export const Downtrend: Story = {
  args: {
    label: "Revenue",
    value: "$12,000",
    series: [500, 480, 450, 420, 380, 340, 310, 290, 260, 220],
    tone: "rose"
  }
};

