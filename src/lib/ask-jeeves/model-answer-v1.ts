import "@/lib/server-only";

import { generateText } from "ai";
import type { AskJeevesAnswerV1, AskJeevesContextV1 } from "@/lib/ask-jeeves/answer-engine-v1";

function compactContext(context: AskJeevesContextV1) {
  return {
    reportingPeriod: context.home.hero.range_label,
    businessPulse: context.home.command_center.business_pulse.map((metric) => ({
      metric: metric.label,
      value: metric.value,
      comparison: metric.comparison,
      source: metric.source,
      state: metric.truth_state
    })),
    products: context.websiteConversion?.wooCommerce?.topProducts?.slice(0, 15) ?? [],
    opportunities: context.opportunities.items.slice(0, 30).map((item) => ({
      name: item.title,
      organization: item.organization,
      status: item.status,
      nextMove: item.nextMove
    })),
    people: context.crm.people.slice(0, 40).map((person) => ({
      name: person.name,
      company: person.companyName,
      relationship: person.relationshipState,
      nextFollowUp: person.nextFollowUpAt,
      opportunity: person.activeOpportunity
    })),
    companies: context.crm.companies.slice(0, 40).map((company) => ({
      name: company.name,
      opportunities: company.activeOpportunities,
      nextMove: company.nextMove
    }))
  };
}

export async function enhanceAskJeevesAnswerV1(
  question: string,
  context: AskJeevesContextV1,
  grounded: AskJeevesAnswerV1
): Promise<AskJeevesAnswerV1> {
  try {
    const result = await generateText({
      model: "openai/gpt-5.6-sol",
      system: [
        "You are the concise executive intelligence layer for Keegan Hall's business dashboard.",
        "Use only the supplied business context and grounded answer.",
        "Never invent a number, relationship, product, status, or source.",
        "If the requested data is absent, say exactly what is unavailable and give the nearest useful verified fact.",
        "Write two to four short sentences in plain business language. Avoid technical jargon."
      ].join(" "),
      prompt: JSON.stringify({ question, groundedAnswer: grounded, businessContext: compactContext(context) })
    });
    const answer = result.text.trim();
    return answer ? { ...grounded, answer } : grounded;
  } catch {
    return grounded;
  }
}
