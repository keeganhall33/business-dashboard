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
  const suppliedSecret = request.headers.get("x-scheduler-secret");
  const expectedSecret = process.env.SCHEDULER_SECRET;

  if (expectedSecret && suppliedSecret === expectedSecret) {
    return;
  }

  const authHeader = request.headers.get("authorization") ?? request.headers.get("x-github-token");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim();

  if (await verifyGithubToken(token ?? null)) {
    return;
  }

  throw new Error("Unauthorized scheduler request");
}
