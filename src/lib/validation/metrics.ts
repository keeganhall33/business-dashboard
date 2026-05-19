import { z } from "zod";

export const createMetricReadingSchema = z.object({
  metricKey: z.string().min(1),
  currentValue: z.number().finite(),
  measuredAt: z.string().datetime().optional(),
  source: z.string().min(1).optional()
});
