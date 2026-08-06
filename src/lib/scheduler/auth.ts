import crypto from "node:crypto";

async function verifyGithubToken(token: string | null) {
  const repo = process.env.SCHEDULER_GITHUB_REPO;
  if (!token || !repo) {
    return false;
  }

  const response = await fetch(`https://api.github.com/repos/${repo}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "business-dashboard-scheduler",
    },
    cache: "no-store",
  });

  return response.ok;
}

export async function assertSchedulerAuth(request: Request) {
  const expectedSecret = process.env.SCHEDULER_SECRET;

  const suppliedSecret = request.headers.get("x-scheduler-secret");
  if (expectedSecret && suppliedSecret === expectedSecret) {
    return;
  }

  const authHeader = request.headers.get("authorization") ?? request.headers.get("x-github-token");
  const schemeValid = Boolean(authHeader && /^Bearer\s+/i.test(authHeader));
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim();

  // Vercel Cron can send Authorization: Bearer <CRON_SECRET>. We reuse the existing
  // scheduler secret so no additional secret distribution is required.
  if (expectedSecret && token === expectedSecret) {
    return;
  }

  if (await verifyGithubToken(token ?? null)) {
    return;
  }

  // TEMP DIAGNOSTIC (remove once scheduler 401 root cause is proven)
  // Never logs token/secret/hashes; logs only safe booleans/lengths and a constant-time match result.
  try {
    const url = new URL(request.url);
    const expected = expectedSecret ?? "";
    const presented = token ?? "";
    const expectedPresent = Boolean(expectedSecret);
    const presentedPresent = Boolean(token);
    const expectedLen = Buffer.byteLength(expected, "utf8");
    const presentedLen = Buffer.byteLength(presented, "utf8");

    let constantTimeMatch = false;
    if (expectedPresent && presentedPresent && expectedLen === presentedLen) {
      const a = Buffer.from(expected, "utf8");
      const b = Buffer.from(presented, "utf8");
      constantTimeMatch = crypto.timingSafeEqual(a, b);
    }

    // eslint-disable-next-line no-console
    console.warn(
      "scheduler_auth_diag",
      JSON.stringify({
        method: request.method,
        path: url.pathname,
        configured_secret_present: expectedPresent,
        configured_secret_length: expectedLen,
        presented_token_present: presentedPresent,
        presented_token_length: presentedLen,
        constant_time_match: constantTimeMatch,
        authorization_scheme_valid: schemeValid,
      })
    );
  } catch {
    // Never block auth failure on diagnostics.
  }

  throw new Error("Unauthorized scheduler request");
}
