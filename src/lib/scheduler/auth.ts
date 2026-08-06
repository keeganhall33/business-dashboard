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
  const cronSecret = process.env.CRON_SECRET;

  const suppliedSecret = request.headers.get("x-scheduler-secret");
  if (expectedSecret && suppliedSecret === expectedSecret) {
    return;
  }

  const authHeader = request.headers.get("authorization") ?? request.headers.get("x-github-token");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim();

  // Support a bearer token for trusted cron runners.
  // Vercel Cron uses: Authorization: Bearer <CRON_SECRET>
  if (cronSecret && token === cronSecret) {
    return;
  }

  // Existing scheduler secret bearer remains accepted.
  if (expectedSecret && token === expectedSecret) {
    return;
  }

  if (await verifyGithubToken(token ?? null)) {
    return;
  }

  throw new Error("Unauthorized scheduler request");
}
