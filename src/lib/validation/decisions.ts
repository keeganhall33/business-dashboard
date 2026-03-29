import { z } from "zod";
import {
  decisionTypeSchema,
  isoDateOrDatetimeSchema,
  nonEmptyTrimmedString,
  optionalTrimmedString
} from "./common";

export const createDecisionSchema = z.object({
  decisionType: decisionTypeSchema,
  title: nonEmptyTrimmedString,
  summary: nonEmptyTrimmedString,
  detailMd: optionalTrimmedString,
  expectedOutcome: optionalTrimmedString,
  outcomeReviewDate: isoDateOrDatetimeSchema.optional(),
  decidedBy: optionalTrimmedString
});
