import { z } from "zod";

export type SupportLocatorTypeV1 = "text_excerpt" | "structured_metadata_field";

export type SupportExcerptV1 = {
  locator_type: SupportLocatorTypeV1;
  /** Deterministic hash of the normalized excerpt text. */
  text_hash: string;
  /** Normalized excerpt text (bounded). */
  text: string;
  /** Optional locator hint (e.g. meta_description, og:title). */
  locator_hint: string | null;
  char_count: number;
  schema_version: "support_excerpt_v1";
};

export const SupportExcerptV1Schema = z
  .object({
    locator_type: z.enum(["text_excerpt", "structured_metadata_field"]),
    text_hash: z.string().regex(/^[a-f0-9]{64}$/),
    text: z.string().min(1),
    locator_hint: z.string().min(1).nullable(),
    char_count: z.number().int().min(1),
    schema_version: z.literal("support_excerpt_v1")
  })
  .strict();
