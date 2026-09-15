"use server";

import { getDashboardOverview } from "@/lib/api/dashboard";
import { answerAskJeevesV1, type AskJeevesAnswerV1 } from "@/lib/ask-jeeves/answer-engine-v1";
import { enhanceAskJeevesAnswerV1 } from "@/lib/ask-jeeves/model-answer-v1";
import { resolveAskQuestionRangeV1, type AskQuestionRangeV1 } from "@/lib/ask-jeeves/question-range-v1";
import { buildExecutiveHomeFromDashboardOverviewV1 } from "@/lib/executive-home/live-adapter";
import { buildExecutiveOpportunityPortfolioV1 } from "@/lib/opportunity-intelligence/executive-opportunity-portfolio-v1";
import { loadCrmDirectoryIndexV1 } from "@/lib/relationships-crm/crm-directory-loader-v1";

export type AskJeevesActionResultV1 =
  | { ok: true; answer: AskJeevesAnswerV1 }
  | { ok: false; message: string };

export async function askJeevesActionV1(
  rawQuestion: string,
  selectedRange?: AskQuestionRangeV1
): Promise<AskJeevesActionResultV1> {
  const question = typeof rawQuestion === "string" ? rawQuestion.trim() : "";
  if (!question || question.length > 500) return { ok: false, message: "Enter a question using 1 to 500 characters." };

  try {
    const [overview, crm] = await Promise.all([
      getDashboardOverview(resolveAskQuestionRangeV1(question, new Date(), selectedRange)),
      loadCrmDirectoryIndexV1()
    ]);
    const context = {
      home: buildExecutiveHomeFromDashboardOverviewV1(overview).home,
      opportunities: buildExecutiveOpportunityPortfolioV1(overview.opportunityRadar?.topOpportunities ?? []),
      crm,
      websiteConversion: overview.websiteConversion ?? null,
      requestedRange: overview.range
    };
    const grounded = answerAskJeevesV1(question, context);
    return { ok: true, answer: await enhanceAskJeevesAnswerV1(question, context, grounded) };
  } catch {
    return { ok: false, message: "I could not reach the business data right now. Please try again in a moment." };
  }
}
