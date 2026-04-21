import { z } from "zod";
import { agentKeySchema, isoDatetimeSchema, nonEmptyTrimmedString, optionalTrimmedString } from "./common";

export const listKpisQuerySchema = z.object({
  agentKey: agentKeySchema.optional()
});

export const upsertKpiSchema = z.object({
  kpiKey: nonEmptyTrimmedString,
  agentKey: agentKeySchema,
  kpiName: nonEmptyTrimmedString,
  description: optionalTrimmedString,
  targetValue: z.union([z.number(), z.string()]).optional(),
  unit: optionalTrimmedString,
  frequency: optionalTrimmedString,
  priority: optionalTrimmedString
});

export const createKpiReadingSchema = z.object({
  value: z.number().nullable().optional(),
  measuredAt: isoDatetimeSchema.optional(),
  source: optionalTrimmedString,
  notes: optionalTrimmedString
});

