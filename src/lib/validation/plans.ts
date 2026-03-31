import { z } from "zod";

export const decidePlanSchema = z.object({
  decision: z.enum(["approve", "changes_requested"]),
  approvedBy: z.string().min(1).optional(),
  feedback: z.string().max(4000).optional()
});
