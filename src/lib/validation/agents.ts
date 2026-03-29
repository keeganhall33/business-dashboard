import { z } from "zod";
import { runTypeSchema } from "./common";

export const runAgentSchema = z.object({
  runType: runTypeSchema.default("manual").optional()
});
