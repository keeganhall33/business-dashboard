import {
  evaluateVercelDeploymentGateV1,
  type GitHubCombinedCommitStatusV1,
} from "../src/lib/release/vercel-deployment-gate-v1";

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`Vercel deployment gate configuration error: ${name} is required.`);
    process.exit(3);
  }
  return value;
}

function safeLogValue(value: string): string {
  return value.replace(/[\r\n]+/g, " ").slice(0, 300);
}

async function main(): Promise<void> {
  const repository = requiredEnv("GITHUB_REPOSITORY");
  const expectedReleaseSha = requiredEnv("EXPECTED_RELEASE_SHA");
  const apiBaseUrl = (process.env.GITHUB_API_URL?.trim() || "https://api.github.com").replace(/\/$/, "");
  const token = process.env.GITHUB_TOKEN?.trim();

  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "business-dashboard-v1-release-gate",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(
    `${apiBaseUrl}/repos/${repository}/commits/${expectedReleaseSha}/status`,
    { headers },
  );

  if (!response.ok) {
    console.error(
      `Vercel deployment gate could not read exact-SHA status: HTTP ${response.status}.`,
    );
    process.exit(3);
  }

  const payload = (await response.json()) as GitHubCombinedCommitStatusV1;
  const gate = evaluateVercelDeploymentGateV1(payload, expectedReleaseSha);

  console.log(`VERCEL_DEPLOYMENT_GATE=${gate.state}`);
  console.log(`VERCEL_DEPLOYMENT_REASON=${gate.reason}`);
  if (gate.updatedAt) {
    console.log(`VERCEL_DEPLOYMENT_STATUS_UPDATED_AT=${safeLogValue(gate.updatedAt)}`);
  }
  if (gate.description) {
    console.log(`Vercel deployment status detail: ${safeLogValue(gate.description)}`);
  }

  if (gate.state === "BLOCKED") {
    console.error(
      `Vercel deployment gate blocked production smoke for exact release ${expectedReleaseSha}.`,
    );
    process.exit(2);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "unknown error";
  console.error(`Vercel deployment gate failed closed: ${safeLogValue(message)}`);
  process.exit(3);
});
