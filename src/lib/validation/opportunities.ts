import { z } from "zod";
import {
  agentKeySchema,
  isoDateOrDatetimeSchema,
  nonEmptyTrimmedString,
  nonNegativeNumberSchema,
  opportunityStatusSchema,
  opportunityTypeSchema,
  optionalTrimmedString,
  probabilitySchema,
  scoreTenSchema
} from "./common";

export const opportunitiesQuerySchema = z.object({
  ownerAgent: agentKeySchema.optional(),
  status: opportunityStatusSchema.optional()
});

export const createOpportunitySchema = z.object({
  name: nonEmptyTrimmedString,
  organization: optionalTrimmedString,
  opportunityType: opportunityTypeSchema,
  status: opportunityStatusSchema,
  valueEstimate: nonNegativeNumberSchema.optional(),
  prestigeScore: scoreTenSchema.optional(),
  probabilityScore: probabilitySchema.optional(),
  ownerAgent: agentKeySchema,
  nextStep: optionalTrimmedString,
  nextStepDueAt: isoDateOrDatetimeSchema.optional(),
  notesMd: optionalTrimmedString,
  source: optionalTrimmedString
});

export const updateOpportunityStatusSchema = z.object({
  status: opportunityStatusSchema
});
