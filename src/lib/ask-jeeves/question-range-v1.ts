export type AskQuestionRangeV1 = {
  startDate?: string;
  endDate?: string;
  preset?: string;
};

function isoDay(date: Date) {
  return date.toISOString().slice(0, 10);
}

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12
};

export function resolveAskQuestionRangeV1(question: string, now = new Date()): AskQuestionRangeV1 {
  const normalized = question.trim().toLowerCase();
  const match = normalized.match(/(?:past|last)\s+(\d{1,3}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(day|days|week|weeks|month|months|year|years)\b/);
  if (!match) return { preset: "30d" };

  const amount = NUMBER_WORDS[match[1]] ?? Number(match[1]);
  if (!Number.isFinite(amount) || amount < 1) return { preset: "30d" };

  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const start = new Date(end);
  const unit = match[2];
  if (unit.startsWith("day")) start.setUTCDate(start.getUTCDate() - amount);
  else if (unit.startsWith("week")) start.setUTCDate(start.getUTCDate() - amount * 7);
  else if (unit.startsWith("month")) start.setUTCMonth(start.getUTCMonth() - amount);
  else start.setUTCFullYear(start.getUTCFullYear() - amount);

  return { startDate: isoDay(start), endDate: isoDay(end) };
}
