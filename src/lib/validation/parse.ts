import { z, ZodError } from "zod";

export type Parsed<T> =
  | { success: true; data: T }
  | { success: false; error: { message: string; issues: Array<{ path: string; message: string }> } };

function formatZodError(error: ZodError) {
  return {
    message: "Validation failed",
    issues: error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message
    }))
  };
}

export async function parseJsonBody<T>(request: Request, schema: z.ZodType<T>): Promise<Parsed<T>> {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    json = {};
  }

  const result = schema.safeParse(json);
  if (!result.success) {
    return { success: false, error: formatZodError(result.error) };
  }
  return { success: true, data: result.data };
}

export function parseSearchParams<T>(searchParams: URLSearchParams, schema: z.ZodType<T>): Parsed<T> {
  const raw: Record<string, string> = {};
  for (const [key, value] of searchParams.entries()) raw[key] = value;

  const result = schema.safeParse(raw);
  if (!result.success) {
    return { success: false, error: formatZodError(result.error) };
  }

  return { success: true, data: result.data };
}
