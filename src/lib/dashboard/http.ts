export async function extractResponseError(response: Response) {
  const fallback = `${response.status} ${response.statusText}`.trim();
  try {
    const text = await response.text();
    if (!text) return fallback;
    try {
      const parsed = JSON.parse(text);
      if (parsed?.error?.message) return parsed.error.message as string;
      if (parsed?.message) return parsed.message as string;
      if (typeof parsed === "string") return parsed;
    } catch {
      // text was not JSON
    }
    return text;
  } catch {
    return fallback;
  }
}

export async function ensureOk(response: Response) {
  if (!response.ok) {
    throw new Error(await extractResponseError(response));
  }
  return response;
}
