import type { Meta, StoryObj } from "@storybook/react";
import { PipelineHealthWidget } from "./PipelineHealthWidget";

const meta: Meta<typeof PipelineHealthWidget> = {
  title: "Dashboard/PipelineHealthWidget",
  component: PipelineHealthWidget,
  tags: ["autodocs"],
  args: {
    data: {
      collectors: [
        {
          id: "collector-1",
          name: "Collector One",
          tier: "A",
          status: "warm",
          lastOutreachAt: new Date(Date.now() - 86400000 * 2).toISOString(),
          nextMove: "Send proposal deck",
          nextMoveDueAt: new Date(Date.now() + 86400000 * 3).toISOString(),
          estimatedValue: 25000,
          supportingDocs: [{ label: "Email", url: "https://example.com" }]
        }
      ],
      deals: [
        {
          id: "deal-1",
          name: "Licensing deal",
          organization: "Studio",
          opportunityType: "licensing",
          status: "in_progress",
          valueEstimate: 40000,
          prestigeScore: 7,
          probabilityScore: 0.6,
          nextStep: "Legal review",
          nextStepDueAt: new Date(Date.now() + 86400000 * 2).toISOString(),
          ownerAgent: "avery",
          supportingDocs: [{ label: "Doc", url: "https://example.com" }]
        }
      ]
    }
  }
};

export default meta;
type Story = StoryObj<typeof PipelineHealthWidget>;

export const Default: Story = {};
