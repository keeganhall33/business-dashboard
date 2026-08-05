import { z } from "zod";

export const FredSeriesObservationsResponseSchema = z
  .object({
    observations: z.array(
      z
        .object({
          date: z.string().min(4),
          value: z.string()
        })
        .strict()
    )
  })
  .strict();

export type FredSeriesObservationsResponse = z.infer<typeof FredSeriesObservationsResponseSchema>;

export const FredCollectionParamsSchema = z
  .object({
    series_id: z.string().min(1).max(64),
    observation_start: z.string().datetime().optional(),
    observation_end: z.string().datetime().optional(),
    limit: z.number().int().min(1).max(100000).default(1000)
  })
  .strict();

export type FredCollectionParams = z.infer<typeof FredCollectionParamsSchema>;
