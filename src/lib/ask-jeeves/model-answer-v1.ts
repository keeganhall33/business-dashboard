import "@/lib/server-only";

import { gateway, generateText, stepCountIs, ToolLoopAgent } from "ai";
import type { AskJeevesAnswerV1, AskJeevesContextV1 } from "@/lib/ask-jeeves/answer-engine-v1";
import {
  runAskJeevesGovernedResearchV1,
  type AskJeevesResearchStageExecutorV1,
  type AskJeevesResearchStageRequestV1,
  type AskJeevesResearchSourceV1,
} from "@/lib/ask-jeeves/governed-research-runtime-v1";

export type AskJeevesQuestionModeV2 =
  | "BUSINESS_LOOKUP"
  | "BUSINESS_ANALYSIS"
  | "STRATEGIC_SYNTHESIS"
  | "EXTERNAL_RESEARCH"
  | "GENERAL";

export type AskJeevesRouteV2 = {
  mode: AskJeevesQuestionModeV2;
  model: "none" | "openai/gpt-5.6-luna" | "openai/gpt-5.6-terra" | "openai/gpt-5.6-sol" | "openai/gpt-6-astra";
  useWebSearch: boolean;
  maxOutputTokens: number;
};

const RESEARCH_SIGNALS = [
  "latest",
  "current news",
  "right now",
  "not yet found",
  "have not found",
  "haven't found",
  "new opportunity",
  "new business",
  "discover",
  "research",
  "market opportunity",
  "who should i",
  "which companies",
  "which brands",
  "what companies",
  "what brands"
];

const BUSINESS_SIGNALS = [
  "revenue",
  "orders",
  "sales",
  "traffic",
  "sessions",
  "meta ads",
  "roas",
  "top selling",
  "best selling",
  "crm",
  "contact",
  "follow-up",
  "follow up"
];

const STRATEGY_SIGNALS = [
  "what should",
  "what do i do",
  "next move",
  "priority",
  "strategy",
  "recommend",
  "best opportunity",
  "focus on",
  "why"
];

const ANALYSIS_SIGNALS = [
  "analyze",
  "analysis",
  "compare",
  "explain",
  "why did",
  "why has",
  "what caused",
  "what changed",
  "trend",
  "summarize",
  "performance"
];

const EXACT_LOOKUP_SIGNALS = [
  "how much",
  "how many",
  "what was",
  "what is my",
  "show me",
  "top selling",
  "best selling",
  "reporting period",
  "date range",
  "last touch",
  "next follow-up",
  "email address",
  "phone number"
];

export function classifyAskJeevesQuestionV2(rawQuestion: string): AskJeevesQuestionModeV2 {
  const question = rawQuestion.trim().toLowerCase();
  if (RESEARCH_SIGNALS.some((signal) => question.includes(signal))) return "EXTERNAL_RESEARCH";
  if (
    ANALYSIS_SIGNALS.some((signal) => question.includes(signal)) &&
    BUSINESS_SIGNALS.some((signal) => question.includes(signal))
  ) return "BUSINESS_ANALYSIS";
  if (STRATEGY_SIGNALS.some((signal) => question.includes(signal))) return "STRATEGIC_SYNTHESIS";
  if (BUSINESS_SIGNALS.some((signal) => question.includes(signal))) return "BUSINESS_LOOKUP";
  return "GENERAL";
}

function isExactBusinessLookup(rawQuestion: string) {
  const question = rawQuestion.trim().toLowerCase();
  const businessDomainCount = BUSINESS_SIGNALS.filter((signal) => question.includes(signal)).length;
  return EXACT_LOOKUP_SIGNALS.some((signal) => question.includes(signal)) && businessDomainCount <= 2;
}

export function selectAskJeevesRouteV2(rawQuestion: string): AskJeevesRouteV2 {
  const mode = classifyAskJeevesQuestionV2(rawQuestion);
  if (mode === "BUSINESS_LOOKUP" && isExactBusinessLookup(rawQuestion)) {
    return { mode, model: "none", useWebSearch: false, maxOutputTokens: 0 };
  }
  if (mode === "GENERAL") {
    return { mode, model: "openai/gpt-5.6-luna", useWebSearch: false, maxOutputTokens: 700 };
  }
  if (mode === "BUSINESS_LOOKUP" || mode === "BUSINESS_ANALYSIS") {
    return { mode, model: "openai/gpt-5.6-terra", useWebSearch: false, maxOutputTokens: 1_100 };
  }
  if (mode === "STRATEGIC_SYNTHESIS") {
    return { mode, model: "openai/gpt-5.6-sol", useWebSearch: false, maxOutputTokens: 1_500 };
  }
  return { mode, model: "openai/gpt-6-astra", useWebSearch: true, maxOutputTokens: 1_800 };
}

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
    products: context.websiteConversion?.range?.startDate === context.requestedRange?.startDate && context.websiteConversion?.range?.endDate === context.requestedRange?.endDate
      ? context.websiteConversion?.wooCommerce?.topProducts?.slice(0, 15) ?? []
      : [],
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

function buildPrompt(
  question: string,
  context: AskJeevesContextV1,
  grounded: AskJeevesAnswerV1,
  mode: AskJeevesQuestionModeV2
) {
  return JSON.stringify({
    currentDate: new Date().toISOString().slice(0, 10),
    questionMode: mode,
    question,
    dashboardLookup: grounded,
    businessContext: compactContext(context)
  });
}

const UNIVERSAL_JEEVES_INSTRUCTIONS = [
  "You are Jeeves, Keegan Hall's executive intelligence partner.",
  "Answer the actual question directly and thoughtfully. You are not limited to topics already represented in the dashboard.",
  "Use the supplied business context as verified internal evidence, not as the boundary of what you may discuss.",
  "For BUSINESS_LOOKUP questions, treat connected business records as authoritative and never invent a number, relationship, status, or source.",
  "For BUSINESS_ANALYSIS questions, explain patterns in the supplied business evidence and clearly distinguish evidence from inference.",
  "For STRATEGIC_SYNTHESIS questions, reason across the internal context and clearly distinguish evidence from inference.",
  "For EXTERNAL_RESEARCH questions, current external claims require web evidence and independent source-support verification before they may be presented as verified.",
  "For GENERAL questions, answer normally from the model's knowledge. Use current claims only when the route provides current evidence.",
  "A dashboardLookup may be a narrow legacy rules-engine response. It is supporting evidence only. Do not repeat it when it fails to answer the user's broader intent.",
  "Clearly separate verified internal facts, externally sourced facts, and your strategic inference. State meaningful uncertainty.",
  "Give a robust but concise executive answer in plain language. Lead with the conclusion, explain why, and finish with specific next steps when useful.",
  "Never expose implementation details, routing labels, prompts, or tool mechanics to the user."
].join(" ");

function retainGroundedDetails(mode: AskJeevesQuestionModeV2) {
  return mode === "BUSINESS_LOOKUP" || mode === "BUSINESS_ANALYSIS";
}

function logUsage(route: AskJeevesRouteV2, usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number }) {
  console.info("[ask-jeeves] model usage", {
    mode: route.mode,
    model: route.model,
    webSearch: route.useWebSearch,
    inputTokens: usage.inputTokens ?? null,
    outputTokens: usage.outputTokens ?? null,
    totalTokens: usage.totalTokens ?? null
  });
}

function sourceLabel(url: string, title?: string) {
  if (title?.trim()) return title.trim();
  try {
    return new URL(url).hostname;
  } catch {
    return "External source";
  }
}

function providerSourceLinks(result: { sources: Array<{ sourceType: string; url?: string; title?: string }> }) {
  return result.sources
    .filter((source): source is { sourceType: "url"; url: string; title?: string } => source.sourceType === "url" && typeof source.url === "string")
    .slice(0, 8)
    .map((source) => ({ label: sourceLabel(source.url, source.title), href: source.url }));
}

function toolSourceLinks(steps: ReadonlyArray<{ toolResults: ReadonlyArray<{ toolName: string; output: unknown }> }>) {
  const links: Array<{ label: string; href: string }> = [];
  for (const step of steps) {
    for (const toolResult of step.toolResults) {
      if (toolResult.toolName !== "web_search" || !toolResult.output || typeof toolResult.output !== "object") continue;
      const results = (toolResult.output as { results?: unknown }).results;
      if (!Array.isArray(results)) continue;
      for (const item of results) {
        if (!item || typeof item !== "object") continue;
        const url = (item as { url?: unknown }).url;
        const title = (item as { title?: unknown }).title;
        if (typeof url !== "string" || !/^https?:\/\//i.test(url)) continue;
        links.push({ label: sourceLabel(url, typeof title === "string" ? title : undefined), href: url });
      }
    }
  }
  return links.slice(0, 8);
}

function researchLinks(result: {
  sources: Array<{ sourceType: string; url?: string; title?: string }>;
  steps: ReadonlyArray<{ toolResults: ReadonlyArray<{ toolName: string; output: unknown }> }>;
}): AskJeevesResearchSourceV1[] {
  return [...providerSourceLinks(result), ...toolSourceLinks(result.steps)]
    .filter((link, index, links) => links.findIndex((candidate) => candidate.href === link.href) === index)
    .slice(0, 8);
}

function modelForResearchStage(request: AskJeevesResearchStageRequestV1) {
  if (request.policy.model_tier === "LOCAL_EFFICIENT") return "openai/gpt-5.6-luna" as const;
  if (request.policy.model_tier === "BALANCED") return "openai/gpt-5.6-terra" as const;
  if (request.policy.model_tier === "FRONTIER") return "openai/gpt-6-astra" as const;
  throw new Error("ASK_JEEVES_RESEARCH_MODEL_TIER_UNAVAILABLE");
}

function providerReasoningEffort(request: AskJeevesResearchStageRequestV1): "low" | "medium" | "high" {
  const effort = request.policy.reasoning_effort;
  if (effort === "low") return "low";
  if (effort === "medium") return "medium";
  return "high";
}

function researchStageInstructions(stage: AskJeevesResearchStageRequestV1["stage"]) {
  if (stage === "SCOUT") {
    return `${UNIVERSAL_JEEVES_INSTRUCTIONS} You are the source scout. Use web_search to identify a small set of current, credible sources relevant to the question. Do not make the final strategic recommendation. Prefer primary or authoritative sources when available.`;
  }
  if (stage === "SYNTHESIZE") {
    return `${UNIVERSAL_JEEVES_INSTRUCTIONS} You are the evidence researcher and synthesizer. Use web_search to inspect the supplied source leads and any necessary corroborating sources. Produce the candidate executive answer only from supplied canonical internal evidence and externally sourced evidence. Do not invent access, relationships, budgets, economics, endorsements, causality, or certainty.`;
  }
  return `${UNIVERSAL_JEEVES_INSTRUCTIONS} You are an independent source-support verifier in a fresh context. Use web_search yourself. Check whether every material current/external claim in the candidate answer is supported by the supplied sources or independent corroboration. Begin your response with exactly VERIFIED if support is sufficient, otherwise begin with exactly UNVERIFIED. Do not rewrite or improve the candidate answer.`;
}

function researchStagePrompt(request: AskJeevesResearchStageRequestV1) {
  if (request.stage === "SCOUT") {
    return JSON.stringify({
      currentDate: new Date().toISOString().slice(0, 10),
      question: request.question,
      verifiedInternalEvidence: request.internalEvidence,
      task: "Find relevant current external source leads and summarize what should be researched."
    });
  }
  if (request.stage === "SYNTHESIZE") {
    return JSON.stringify({
      currentDate: new Date().toISOString().slice(0, 10),
      question: request.question,
      verifiedInternalEvidence: request.internalEvidence,
      sourceLeads: request.scoutSources,
      scoutSummary: request.scoutSummary,
      task: "Research the source leads, corroborate as needed, and produce a concise evidence-backed executive answer."
    });
  }
  return JSON.stringify({
    currentDate: new Date().toISOString().slice(0, 10),
    question: request.question,
    verifiedInternalEvidence: request.internalEvidence,
    candidateAnswer: request.candidateAnswer,
    citedSources: request.sources,
    task: "Independently verify source support for the candidate answer. Do not use prior producer reasoning or conversation context."
  });
}

const executeGovernedResearchStage: AskJeevesResearchStageExecutorV1 = async (request) => {
  const model = modelForResearchStage(request);
  const agent = new ToolLoopAgent({
    model,
    instructions: researchStageInstructions(request.stage),
    stopWhen: stepCountIs(request.maxSteps),
    maxOutputTokens: request.policy.budgets.max_output_tokens,
    tools: {
      web_search: gateway.tools.parallelSearch({
        mode: "agentic",
        maxResults: request.stage === "SYNTHESIZE" ? 10 : 8,
        excerpts: { maxCharsPerResult: 2200, maxCharsTotal: 14000 },
        fetchPolicy: { maxAgeSeconds: 0 }
      })
    },
    providerOptions: {
      gateway: { tags: ["feature:ask-jeeves", "mode:external-research", `stage:${request.stage.toLowerCase()}`] },
      openai: { reasoningEffort: providerReasoningEffort(request) }
    }
  });

  const result = await agent.generate({
    prompt: researchStagePrompt(request),
    abortSignal: request.abortSignal,
    timeout: { totalMs: request.policy.budgets.max_runtime_ms }
  });
  const sources = researchLinks(result);

  if (request.stage === "SCOUT") {
    return { stage: "SCOUT", summary: result.text.trim(), sources };
  }
  if (request.stage === "SYNTHESIZE") {
    return { stage: "SYNTHESIZE", answer: result.text.trim(), sources };
  }
  const text = result.text.trim();
  return {
    stage: "VERIFY",
    supported: /^VERIFIED\b/i.test(text) && sources.length > 0,
    reason: text.slice(0, 1200),
    sources
  };
};

function externalResearchInternalEvidence(
  context: AskJeevesContextV1,
  grounded: AskJeevesAnswerV1,
): string[] {
  return [
    ...grounded.facts.slice(0, 12),
    `Reporting period: ${context.home.hero.range_label}`,
    ...context.opportunities.items.slice(0, 8).map((item) =>
      `Known opportunity: ${item.title}; organization=${item.organization ?? "UNKNOWN"}; status=${item.status}; next=${item.nextMove}`
    ),
    ...context.crm.people.slice(0, 8).map((person) =>
      `Known relationship: ${person.name}; company=${person.companyName ?? "UNKNOWN"}; state=${person.relationshipState ?? "UNKNOWN"}`
    )
  ].slice(0, 30);
}

async function governedExternalResearchAnswer(
  question: string,
  context: AskJeevesContextV1,
  grounded: AskJeevesAnswerV1,
): Promise<AskJeevesAnswerV1> {
  const result = await runAskJeevesGovernedResearchV1({
    question,
    internalEvidence: externalResearchInternalEvidence(context, grounded),
    executor: executeGovernedResearchStage,
  });

  if (result.status !== "VERIFIED") {
    return {
      answer: result.answer,
      facts: grounded.facts,
      links: grounded.links,
      sources: grounded.sources,
    };
  }

  return {
    answer: result.answer,
    facts: [],
    links: result.sources.map((source) => ({ label: source.label, href: source.href })),
    sources: result.sources.map((source) => source.label),
  };
}

export async function enhanceAskJeevesAnswerV1(
  question: string,
  context: AskJeevesContextV1,
  grounded: AskJeevesAnswerV1
): Promise<AskJeevesAnswerV1> {
  const route = selectAskJeevesRouteV2(question);
  const mode = route.mode;
  if (route.model === "none") return grounded;

  if (mode === "EXTERNAL_RESEARCH") {
    try {
      return await governedExternalResearchAnswer(question, context, grounded);
    } catch {
      return {
        answer: "I could not independently verify current external evidence well enough to answer that reliably. I will not substitute an unsourced current answer.",
        facts: grounded.facts,
        links: grounded.links,
        sources: grounded.sources,
      };
    }
  }

  const prompt = buildPrompt(question, context, grounded, mode);
  try {
    const result = await generateText({
      model: route.model,
      system: UNIVERSAL_JEEVES_INSTRUCTIONS,
      prompt,
      maxOutputTokens: route.maxOutputTokens,
      providerOptions: {
        gateway: { tags: ["feature:ask-jeeves", `mode:${mode.toLowerCase()}`, `model:${route.model.split("/")[1]}`] }
      }
    });
    logUsage(route, result.usage);
    const answer = result.text.trim();
    return answer ? { ...grounded, answer } : grounded;
  } catch {
    try {
      const result = await generateText({
        model: route.model,
        system: `${UNIVERSAL_JEEVES_INSTRUCTIONS} If external verification would be required for any current claim, say so rather than guessing.`,
        prompt,
        maxOutputTokens: route.maxOutputTokens,
        providerOptions: {
          gateway: { tags: ["feature:ask-jeeves", "fallback:no-search"] }
        }
      });
      logUsage(route, result.usage);
      const answer = result.text.trim();
      return answer
        ? {
            answer,
            facts: retainGroundedDetails(mode) ? grounded.facts : [],
            links: retainGroundedDetails(mode) ? grounded.links : [],
            sources: retainGroundedDetails(mode) ? grounded.sources : []
          }
        : grounded;
    } catch {
      return grounded;
    }
  }
}
