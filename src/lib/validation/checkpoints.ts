import { z } from "zod";

export const upsertCheckpointSchema = z.object({
  agentKey: z.string().min(1),
  checkpointKey: z.string().min(1),
  status: z.enum(["started", "completed", "failed"]),
  detailMd: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional()
});
