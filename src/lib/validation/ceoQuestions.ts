import { z } from "zod";
import { agentKeySchema, isoDatetimeSchema, nonEmptyTrimmedString, optionalTrimmedString } from "./common";

export const ceoQuestionStatusSchema = z.enum(["open", "answered", "needs_followup", "closed"]);
export const escalationLevelSchema = z.enum(["avery", "keegan"]);

export const ceoQuestionsQuerySchema = z.object({
  status: ceoQuestionStatusSchema.optional(),
  escalationLevel: escalationLevelSchema.optional(),
  askedBy: agentKeySchema.optional(),
  ownerAgent: agentKeySchema.optional()
});

export const createCeoQuestionSchema = z.object({
  askedBy: agentKeySchema,
  escalationLevel: escalationLevelSchema.optional(),
  question: nonEmptyTrimmedString,
  context: optionalTrimmedString,
  status: ceoQuestionStatusSchema.optional(),
  priority: optionalTrimmedString,
  ownerAgent: agentKeySchema.optional(),
  dueAt: isoDatetimeSchema.optional()
});

export const patchCeoQuestionSchema = z.object({
  status: ceoQuestionStatusSchema.optional(),
  escalationLevel: escalationLevelSchema.optional(),
  priority: optionalTrimmedString,
  ownerAgent: agentKeySchema.optional().nullable(),
  dueAt: isoDatetimeSchema.optional().nullable(),
  markAnswered: z.boolean().optional(),
  answeredBy: optionalTrimmedString,
  escalatedBy: optionalTrimmedString
});

export const createCeoQuestionCommentSchema = z.object({
  commenter: nonEmptyTrimmedString,
  body: nonEmptyTrimmedString
});

