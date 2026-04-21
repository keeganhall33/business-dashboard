import { z } from "zod";
import {
  executionTypeSchema,
  nonEmptyTrimmedString,
  nonNegativeNumberSchema,
  optionalStringArraySchema,
  optionalTrimmedString,
  taskPrioritySchema,
  taskStatusSchema,
  agentKeySchema
} from "./common";

export const tasksQuerySchema = z.object({
  agentKey: agentKeySchema.optional(),
  priority: taskPrioritySchema.optional(),
  status: taskStatusSchema.optional()
});

export const createTaskSchema = z.object({
  title: nonEmptyTrimmedString,
  description: optionalTrimmedString,
  agentKey: agentKeySchema,
  priority: taskPrioritySchema,
  expectedImpact: optionalTrimmedString,
  impactScore: nonNegativeNumberSchema.max(10).optional(),
  whyThisMatters: optionalTrimmedString,
  relatedMetricKeys: optionalStringArraySchema,
  requiresApproval: z.boolean().optional(),
  executionType: executionTypeSchema
});

export const approveTaskSchema = z.object({
  approvedByUser: z.boolean()
});

export const rejectTaskSchema = z.object({
  reason: nonEmptyTrimmedString
});

export const updateTaskStatusSchema = z.object({
  status: taskStatusSchema
});

const deliverableAttachmentSchema = z.object({
  label: nonEmptyTrimmedString,
  url: z.string().url()
});

export const completeTaskSchema = z.object({
  resultSummary: nonEmptyTrimmedString,
  attachments: z.array(deliverableAttachmentSchema).max(10).optional()
});
