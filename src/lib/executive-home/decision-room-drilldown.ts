import type { DecisionRoomViewModelV1 } from "@/lib/decision-room/contracts";
import type { AskJeevesControlV1 } from "@/lib/intelligence-ux/responsive-shell-fixtures";

export type ExecutiveHomeDecisionRoomDrilldownV1 = DecisionRoomViewModelV1 & {
  source_card_id: string;
  contextual_ask: AskJeevesControlV1;
};
