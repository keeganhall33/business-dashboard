import { z } from "zod";
import {
  agentKeys,
  decisionTypes,
  executionTypes,
  opportunityStatuses,
  opportunityTypes,
  runTypes,
  taskPriorities,
  taskStatuses
} from "@/lib/types/requests";

export const nonEmptyTrimmedString = z
  .string()
  .transform((value) => value.trim())
  .refine((value) => value.length > 0, "Required");

export const optionalTrimmedString = z
  .string()
  .transform((value) => value.trim())
  .optional();

export const optionalStringArraySchema = z
  .array(nonEmptyTrimmedString)
  .max(50)
  .optional();

export const isoDatetimeSchema = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), "Invalid ISO datetime");

export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid ISO date (YYYY-MM-DD)");

export const isoDateOrDatetimeSchema = z.union([isoDatetimeSchema, isoDateSchema]);

export const probabilitySchema = z.number().min(0).max(1);
export const scoreTenSchema = z.number().min(0).max(10);
export const nonNegativeNumberSchema = z.number().min(0);

export const agentKeySchema = z.enum(agentKeys);
export const taskPrioritySchema = z.enum(taskPriorities);
export const taskStatusSchema = z.enum(taskStatuses);
export const executionTypeSchema = z.enum(executionTypes);
export const opportunityTypeSchema = z.enum(opportunityTypes);
export const opportunityStatusSchema = z.enum(opportunityStatuses);
export const decisionTypeSchema = z.enum(decisionTypes);
export const runTypeSchema = z.enum(runTypes);
