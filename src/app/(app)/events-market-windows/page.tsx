import { ExecutiveEventPortfolioV1 } from "@/components/event-intelligence/ExecutiveEventPortfolioV1";
import { buildExecutiveEventPortfolioV1 } from "@/lib/event-intelligence/executive-event-portfolio-v1";
import type { SportsMilestone } from "@/lib/external-intelligence/milestones/contracts";
import { SportsMilestoneRepository } from "@/lib/external-intelligence/milestones/persistence/milestone.repository";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export default async function EventsMarketWindowsPage() {
  const asOfDate = new Date().toISOString().slice(0, 10);
  let sourceStatus: "AVAILABLE" | "UNAVAILABLE" = "AVAILABLE";
  let milestones: SportsMilestone[] = [];

  try {
    const repository = new SportsMilestoneRepository();
    milestones = await repository.listCurrentMilestonesForHorizonScan();
  } catch {
    sourceStatus = "UNAVAILABLE";
  }

  const portfolio = buildExecutiveEventPortfolioV1(milestones, asOfDate);

  return <ExecutiveEventPortfolioV1 portfolio={portfolio} sourceStatus={sourceStatus} />;
}
