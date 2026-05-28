import { z } from "zod";

const isoDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")
  .optional();

export const industryPulseQuerySchema = z.object({
  day: isoDay,
  days: z
    .string()
    .optional()
    .transform((value) => (value ? Number(value) : 14))
    .refine((value) => Number.isFinite(value) && value >= 1 && value <= 31, "days must be 1..31"),
  limit: z
    .string()
    .optional()
    .transform((value) => (value ? Number(value) : 5))
    .refine((value) => Number.isFinite(value) && value >= 1 && value <= 20, "limit must be 1..20")
});

export const industryPulsePatchSchema = z.object({
  id: z.string().min(1),
  contacted: z.boolean().optional(),
  dismissed: z.boolean().optional(),
  addedToPipeline: z
    .object({
      opportunityId: z.string().optional()
    })
    .optional()
});
