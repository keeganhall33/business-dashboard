type RobotsRule = {
  disallow: string;
  allow: string;
};

// Minimal robots.txt handler.
// We only need to be a good citizen for our own fetching (RSS endpoints + occasional HTML).
// Precedence rules in robots can get complex; we keep a conservative, low-volume approach.

const cache = new Map<string, { fetchedAtMs: number; rules: RobotsRule[]; crawlDelaySeconds?: number | null }>();

const ALLOWLIST_HOSTS = new Set([
  "boardroom.tv",
  "www.boardroom.tv",
  "frontofficesports.com",
  "www.frontofficesports.com",
  "news.google.com"
]);

function normalizePath(p: string) {
  if (!p.startsWith("/")) return `/${p}`;
  return p;
}

function matchesPath(rulePath: string, targetPath: string) {
  // Empty disallow means allow all.
  if (!rulePath) return true;
  const prefix = rulePath.replace(/\*+$/g, "");
  return targetPath.startsWith(prefix);
}

export async function canFetchUrl(url: string, userAgent = "business-dashboard-bot") {
  const u = new URL(url);
  const hostLower = u.host.toLowerCase();

  if (ALLOWLIST_HOSTS.has(hostLower)) {
    return true;
  }

  const hostKey = `${u.protocol}//${u.host}`;

  const cached = cache.get(hostKey);
  const now = Date.now();
  if (cached && now - cached.fetchedAtMs < 6 * 60 * 60 * 1000) {
    return computeCanFetch(cached.rules, u.pathname);
  }

  let robotsText = "";
  try {
    const robotsUrl = new URL("/robots.txt", hostKey).toString();
    const res = await fetch(robotsUrl, {
      headers: {
        "user-agent": userAgent,
        accept: "text/plain,*/*"
      }
    });

    // If robots is missing, default to allow.
    if (!res.ok) {
      cache.set(hostKey, { fetchedAtMs: now, rules: [] });
      return true;
    }

    robotsText = await res.text();
  } catch {
    // Network issues -> do not hard fail the job; be conservative but still allow RSS.
    cache.set(hostKey, { fetchedAtMs: now, rules: [] });
    return true;
  }

  const rules = parseRobots(robotsText, userAgent);
  cache.set(hostKey, { fetchedAtMs: now, rules });
  return computeCanFetch(rules, u.pathname);
}

function computeCanFetch(rules: RobotsRule[], pathname: string) {
  const path = normalizePath(pathname);
  // If there are no rules, allow.
  if (!rules.length) return true;

  // Find the longest matching allow/disallow and apply allow-precedence.
  let bestAllow = "";
  let bestDisallow = "";

  for (const rule of rules) {
    if (rule.allow && matchesPath(rule.allow, path) && rule.allow.length > bestAllow.length) {
      bestAllow = rule.allow;
    }
    if (rule.disallow && matchesPath(rule.disallow, path) && rule.disallow.length > bestDisallow.length) {
      bestDisallow = rule.disallow;
    }
  }

  if (!bestDisallow) return true;
  if (bestAllow.length >= bestDisallow.length) return true;
  return false;
}

function parseRobots(text: string, userAgent: string): RobotsRule[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));

  const uaLower = userAgent.toLowerCase();

  let activeForUs = false;
  let seenAnyUserAgent = false;

  const rules: RobotsRule[] = [];

  for (const line of lines) {
    const [rawKey, ...rest] = line.split(":");
    if (!rawKey || !rest.length) continue;
    const key = rawKey.trim().toLowerCase();
    const value = rest.join(":").trim();

    if (key === "user-agent") {
      seenAnyUserAgent = true;
      const ua = value.toLowerCase();
      activeForUs = ua === "*" || uaLower.includes(ua) || uaLower === ua;
      continue;
    }

    // If robots.txt has no User-agent sections, treat as allow.
    if (seenAnyUserAgent && !activeForUs) continue;

    if (key === "disallow") {
      rules.push({ disallow: normalizePath(value), allow: "" });
    }

    if (key === "allow") {
      rules.push({ disallow: "", allow: normalizePath(value) });
    }
  }

  return rules;
}
