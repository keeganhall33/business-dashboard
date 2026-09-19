import { pathToFileURL } from "node:url";

function normalizedState(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function isCanonicalVercelContext(value) {
  return typeof value === "string" && value.trim().toLowerCase() === "vercel";
}

function timestampValue(value) {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function latestVercelStatus(statuses) {
  const matches = statuses.filter((status) => isCanonicalVercelContext(status?.context));
  if (matches.length === 0) return null;
  return [...matches].sort(
    (left, right) => timestampValue(right?.updated_at) - timestampValue(left?.updated_at),
  )[0] ?? null;
}

export function evaluateVercelDeploymentGateV1(response, expectedReleaseSha) {
  if (typeof expectedReleaseSha !== "string" || !expectedReleaseSha.trim()) {
    return {
      state: "BLOCKED",
      reason: "STATUS_RESPONSE_MALFORMED",
      description: "Expected release SHA is missing.",
      updatedAt: null,
    };
  }

  if (response?.sha && response.sha !== expectedReleaseSha) {
    return {
      state: "BLOCKED",
      reason: "STATUS_RESPONSE_SHA_MISMATCH",
      description: null,
      updatedAt: null,
    };
  }

  if (!Array.isArray(response?.statuses)) {
    return {
      state: "BLOCKED",
      reason: "STATUS_RESPONSE_MALFORMED",
      description: null,
      updatedAt: null,
    };
  }

  const vercelStatus = latestVercelStatus(response.statuses);
  if (!vercelStatus) {
    return {
      state: "WAIT",
      reason: "VERCEL_STATUS_NOT_YET_REPORTED",
      description: null,
      updatedAt: null,
    };
  }

  const state = normalizedState(vercelStatus.state);
  const common = {
    description: typeof vercelStatus.description === "string" ? vercelStatus.description : null,
    updatedAt: typeof vercelStatus.updated_at === "string" ? vercelStatus.updated_at : null,
  };

  if (state === "success") {
    return { state: "READY", reason: "VERCEL_STATUS_SUCCESS", ...common };
  }
  if (state === "pending") {
    return { state: "WAIT", reason: "VERCEL_STATUS_PENDING", ...common };
  }
  if (state === "failure") {
    return { state: "BLOCKED", reason: "VERCEL_STATUS_FAILURE", ...common };
  }
  if (state === "error") {
    return { state: "BLOCKED", reason: "VERCEL_STATUS_ERROR", ...common };
  }

  return { state: "BLOCKED", reason: "VERCEL_STATUS_UNSUPPORTED", ...common };
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`Vercel deployment gate configuration error: ${name} is required.`);
    process.exit(3);
  }
  return value;
}

function safeLogValue(value) {
  return String(value).replace(/[\r\n]+/g, " ").slice(0, 300);
}

async function main() {
  const repository = requiredEnv("GITHUB_REPOSITORY");
  const expectedReleaseSha = requiredEnv("EXPECTED_RELEASE_SHA");
  const apiBaseUrl = (process.env.GITHUB_API_URL?.trim() || "https://api.github.com").replace(/\/$/, "");
  const token = process.env.GITHUB_TOKEN?.trim();

  const headers = {
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

  const payload = await response.json();
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

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : "unknown error";
    console.error(`Vercel deployment gate failed closed: ${safeLogValue(message)}`);
    process.exit(3);
  });
}
