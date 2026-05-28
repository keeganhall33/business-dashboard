import type { Meta, StoryObj } from "@storybook/react";
import { IndustryPulsePanel } from "./IndustryPulsePanel";

const meta: Meta<typeof IndustryPulsePanel> = {
  title: "Dashboard/IndustryPulsePanel",
  component: IndustryPulsePanel,
  tags: ["autodocs"],
  args: {
    initialSnapshot: {
      day: "2026-05-26",
      refreshedAtIso: new Date().toISOString(),
      items: [
        {
          id: "pulse-1",
          day: "2026-05-26",
          source: "WWD",
          headline: "Luxury retail launches a creator capsule program",
          summary: "A major luxury retailer is piloting limited creator capsules tied to in-store activations.",
          collabIdea: "Pitch a limited-edition pencil print drop + live sketch session at their flagship.",
          whyNow: "Program is in pilot; they’re actively seeking first-wave partners.",
          contactEmail: "partnerships@luxretail.example",
          contactConfidence: 0.82,
          contactStatus: "suspected" as const,
          sourceUrl: "https://example.com/article"
        },
        {
          id: "pulse-2",
          day: "2026-05-26",
          source: "Variety",
          headline: "Sports doc series expands into artist collaborations",
          summary: "A doc series is commissioning artists for season launch assets.",
          collabIdea: "Offer signature pencil poster + behind-the-scenes content for the launch window.",
          whyNow: "Season promo cycle begins in 2–3 weeks.",
          contactEmail: "marketing@studio.example",
          contactConfidence: 0.63,
          contactStatus: "unknown" as const,
          sourceUrl: null
        }
      ]
    }
  }
};

export default meta;
type Story = StoryObj<typeof IndustryPulsePanel>;

export const Default: Story = {};
