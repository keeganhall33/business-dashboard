import { z } from "zod";
import { agentKeySchema, nonEmptyTrimmedString, optionalTrimmedString } from "./common";

export const ideaTypeSchema = z.enum(["minor", "major"]);
export const ideaStatusSchema = z.enum([
  "proposed",
  "in_review",
  "approved",
  "rejected",
  "in_progress",
  "shipped",
  "archived"
]);

export const ideasQuerySchema = z.object({
  agentKey: agentKeySchema.optional(),
  status: ideaStatusSchema.optional()
});

export const createIdeaSchema = z.object({
  agentKey: agentKeySchema,
  ideaType: ideaTypeSchema,
  title: nonEmptyTrimmedString,
  summary: optionalTrimmedString,
  expectedImpact: z.number().optional(),
  requiresCeoApproval: z.boolean().optional(),
  linkedTaskId: z.string().uuid().optional()
});

export const updateIdeaStatusSchema = z.object({
  status: ideaStatusSchema,
  approver: optionalTrimmedString
});

export const createIdeaCommentSchema = z.object({
  commenter: nonEmptyTrimmedString,
  comment: nonEmptyTrimmedString
});

