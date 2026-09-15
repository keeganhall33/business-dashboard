import { getDashboardOverview } from "@/lib/api/dashboard";
import { badRequest, ok, serverError } from "@/lib/api/responses";
import { answerAskJeevesV1 } from "@/lib/ask-jeeves/answer-engine-v1";
import { enhanceAskJeevesAnswerV1 } from "@/lib/ask-jeeves/model-answer-v1";
import { resolveAskQuestionRangeV1 } from "@/lib/ask-jeeves/question-range-v1";
import { enforceDashboardAuth } from "@/lib/auth/dashboard";
import { buildExecutiveHomeFromDashboardOverviewV1 } from "@/lib/executive-home/live-adapter";
import { buildExecutiveOpportunityPortfolioV1 } from "@/lib/opportunity-intelligence/executive-opportunity-portfolio-v1";
import { loadCrmDirectoryIndexV1 } from "@/lib/relationships-crm/crm-directory-loader-v1";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const authResponse = enforceDashboardAuth(request);
  if (authResponse) return authResponse;

  try {
    const body = await request.json() as { question?: unknown; range?: unknown };
    const question = typeof body.question === "string" ? body.question.trim() : "";
    if (!question || question.length > 500) return badRequest("Question must contain 1 to 500 characters.");
    const selectedRange =
      typeof body.range === "string"
        ? { preset: body.range }
        : body.range && typeof body.range === "object"
          ? {
              preset: typeof (body.range as Record<string, unknown>).preset === "string" ? String((body.range as Record<string, unknown>).preset) : undefined,
              startDate: typeof (body.range as Record<string, unknown>).startDate === "string" ? String((body.range as Record<string, unknown>).startDate) : undefined,
              endDate: typeof (body.range as Record<string, unknown>).endDate === "string" ? String((body.range as Record<string, unknown>).endDate) : undefined
            }
          : undefined;
    const requestedRange = resolveAskQuestionRangeV1(question, new Date(), selectedRange);
    const url = new URL(request.url);
    const [overview, crm] = await Promise.all([
      getDashboardOverview(requestedRange, { baseUrl: url.origin, cookie: request.headers.get("cookie") }),
      loadCrmDirectoryIndexV1()
    ]);
    const home = buildExecutiveHomeFromDashboardOverviewV1(overview).home;
    const opportunities = buildExecutiveOpportunityPortfolioV1(overview.opportunityRadar?.topOpportunities ?? []);
    const context = { home, opportunities, crm, websiteConversion: overview.websiteConversion ?? null, requestedRange: overview.range };
    const grounded = answerAskJeevesV1(question, context);
    return ok({ ok: true, ...await enhanceAskJeevesAnswerV1(question, context, grounded) });
  } catch (error) {
    return serverError("Unable to answer from current business data", { message: error instanceof Error ? error.message : String(error) });
  }
}
