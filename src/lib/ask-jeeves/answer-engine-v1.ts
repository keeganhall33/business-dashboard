import type { ExecutiveHomeFixtureV1 } from "@/lib/executive-home/fixtures";
import type { ExecutiveOpportunityPortfolioV1 } from "@/lib/opportunity-intelligence/executive-opportunity-portfolio-v1";
import type { CrmDirectoryIndexV1 } from "@/lib/relationships-crm/crm-directory-index-v1";

export type AskJeevesAnswerV1 = {
  answer: string;
  facts: string[];
  links: Array<{ label: string; href: string }>;
  sources: string[];
};

export type AskJeevesContextV1 = {
  home: ExecutiveHomeFixtureV1;
  opportunities: ExecutiveOpportunityPortfolioV1;
  crm: CrmDirectoryIndexV1;
};

function includesAny(question: string, terms: string[]) {
  return terms.some((term) => question.includes(term));
}

function metricAnswer(context: AskJeevesContextV1, id: "revenue" | "orders" | "sessions" | "meta"): AskJeevesAnswerV1 {
  const metric = context.home.command_center.business_pulse.find((item) => item.id === id);
  if (!metric) return unavailable(context);
  return {
    answer: `${metric.label} is ${metric.value} for ${context.home.hero.range_label}. ${metric.comparison}.`,
    facts: [`Data state: ${metric.truth_state === "KNOWN" ? "Live" : metric.truth_state.toLowerCase()}`, `Reporting period: ${context.home.hero.range_label}`],
    links: [{ label: "Check source data", href: "/data-evidence" }],
    sources: [metric.source]
  };
}

function opportunityAnswer(question: string, context: AskJeevesContextV1): AskJeevesAnswerV1 {
  const matches = context.opportunities.items.filter((item) =>
    question.includes(item.title.toLowerCase()) ||
    (item.organization ? question.includes(item.organization.toLowerCase()) : false)
  );
  const selected = matches.length ? matches : context.opportunities.items.slice(0, 3);
  if (!selected.length) return unavailable(context, "No supported opportunities are currently available.");
  return {
    answer: matches.length === 1
      ? `${selected[0].title}: ${selected[0].nextMove}`
      : `The current opportunity list starts with ${selected.map((item) => item.title).join(", ")}.`,
    facts: selected.map((item) => `${item.title}: ${item.status}; next: ${item.nextMove}`),
    links: selected.map((item) => ({ label: item.title, href: item.detailHref })),
    sources: ["Canonical opportunity radar"]
  };
}

function relationshipAnswer(question: string, context: AskJeevesContextV1): AskJeevesAnswerV1 {
  const people = context.crm.people.filter((person) => person.name && question.includes(person.name.toLowerCase()));
  const companies = context.crm.companies.filter((company) => company.name && question.includes(company.name.toLowerCase()));
  const selectedPeople = people.length ? people : context.crm.people.slice(0, 3);
  const selectedCompanies = companies.length ? companies : context.crm.companies.slice(0, 2);
  if (!selectedPeople.length && !selectedCompanies.length) return unavailable(context, "No supported CRM records matched that question.");
  return {
    answer: people.length === 1
      ? `${people[0].name} is connected to ${people[0].companyName ?? "an unverified company"}. ${people[0].relationshipState ?? "Relationship state is not yet verified"}.`
      : `I found ${selectedPeople.length} people and ${selectedCompanies.length} companies in the current CRM view.`,
    facts: [
      ...selectedPeople.map((person) => `${person.name}: ${person.companyName ?? "Company unavailable"}; ${person.relationshipState ?? "relationship unavailable"}; next follow-up ${person.nextFollowUpAt ?? "not scheduled"}`),
      ...selectedCompanies.map((company) => `${company.name}: ${company.activeOpportunities.join(", ") || "No active opportunity recorded"}`)
    ],
    links: [
      ...selectedPeople.flatMap((person) => person.detailHref ? [{ label: person.name ?? "Person", href: person.detailHref }] : []),
      ...selectedCompanies.flatMap((company) => company.detailHref ? [{ label: company.name ?? "Company", href: company.detailHref }] : [])
    ],
    sources: ["Canonical CRM entities and relationship records"]
  };
}

function unavailable(context: AskJeevesContextV1, answer = "I could not answer that from the currently connected evidence."): AskJeevesAnswerV1 {
  return { answer, facts: [`Current reporting period: ${context.home.hero.range_label}`], links: [{ label: "View business overview", href: "/dashboard" }], sources: [] };
}

export function answerAskJeevesV1(rawQuestion: string, context: AskJeevesContextV1): AskJeevesAnswerV1 {
  const question = rawQuestion.trim().toLowerCase();
  if (!question) return unavailable(context, "Ask a question about your business.");
  if (includesAny(question, ["revenue", "sales", "money made"])) return metricAnswer(context, "revenue");
  if (includesAny(question, ["orders", "purchases sold"])) return metricAnswer(context, "orders");
  if (includesAny(question, ["traffic", "sessions", "visitors", "website"])) return metricAnswer(context, "sessions");
  if (includesAny(question, ["meta", "facebook ads", "instagram ads", "roas", "ad spend"])) return metricAnswer(context, "meta");
  if (includesAny(question, ["date range", "reporting period", "what period", "what dates"])) {
    return { answer: `The dashboard is showing ${context.home.hero.range_label}.`, facts: [], links: [{ label: "Open dashboard", href: "/dashboard" }], sources: ["Dashboard reporting range"] };
  }
  if (includesAny(question, ["what should", "what do i do", "next move", "priority", "focus now"])) {
    const focus = context.home.cards.find((card) => card.section === "WHAT_MATTERS_NOW");
    return focus ? { answer: focus.title, facts: [focus.summary, `Next: ${focus.next_action}`], links: [{ label: "See why", href: "/dashboard#current-direction" }, { label: "View actions", href: "/opportunities-actions" }], sources: focus.evidence } : unavailable(context);
  }
  if (includesAny(question, ["opportunity", "boeing", "nintendo", "alaska airlines"]) || context.opportunities.items.some((item) => question.includes(item.title.toLowerCase()))) return opportunityAnswer(question, context);
  if (includesAny(question, ["crm", "relationship", "contact", "mercedes", "michelle", "melody"]) || context.crm.people.some((person) => person.name ? question.includes(person.name.toLowerCase()) : false)) return relationshipAnswer(question, context);
  return unavailable(context, "I can currently answer questions about revenue, orders, traffic, Meta ads, priorities, opportunities, reporting dates, and CRM relationships. Broader reasoning is still being connected.");
}
