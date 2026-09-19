import type {
  SocialConnectorHealthIssueV1,
  SocialConnectorHealthPlatformV1,
  SocialConnectorHealthStateV1
} from "@/lib/social-intelligence/social-connector-health-review-v1";
import type { SocialConnectorHealthSurfaceV1 } from "@/lib/social-intelligence/load-social-connector-health-v1";

const HEALTH_LABEL: Record<SocialConnectorHealthStateV1, string> = {
  HEALTHY: "Current",
  DEGRADED: "Degraded",
  STALE: "Stale",
  UNPROVEN: "Not proven",
  BLOCKED: "Blocked",
  NOT_APPLICABLE: "Not connected"
};

const HEALTH_TONE: Record<SocialConnectorHealthStateV1, string> = {
  HEALTHY: "border-emerald-200 bg-emerald-50 text-emerald-900",
  DEGRADED: "border-amber-200 bg-amber-50 text-amber-900",
  STALE: "border-orange-200 bg-orange-50 text-orange-900",
  UNPROVEN: "border-slate-300 bg-slate-100 text-slate-800",
  BLOCKED: "border-rose-200 bg-rose-50 text-rose-900",
  NOT_APPLICABLE: "border-slate-200 bg-white text-slate-600"
};

const ISSUE_COPY: Record<SocialConnectorHealthIssueV1, string> = {
  AUTHORIZATION_REQUIRED: "Account connection required",
  IMPLEMENTATION_REQUIRED: "Engineering setup required",
  SOURCE_UNAVAILABLE: "No supported source available",
  SOURCE_NOT_RECOMMENDED: "No decision-useful source selected",
  CANONICAL_PROOF_MISSING: "Canonical proof missing",
  CANONICAL_PROOF_PARTIAL: "Canonical proof is partial",
  CANONICAL_PROOF_STALE: "Canonical proof is stale",
  LATEST_PROVIDER_RUN_PARTIAL: "Latest provider refresh is partial",
  LATEST_PROVIDER_RUN_FAILED: "Latest provider refresh failed",
  CANONICAL_PROOF_LAGGING: "Canonical proof is behind the provider"
};

export function SocialConnectorHealthPanelV1({ surface }: { surface: SocialConnectorHealthSurfaceV1 }) {
  const review = surface.review;
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm" data-testid="social-connector-health-panel-v1">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-700">Social intelligence</p>
          <h2 className="mt-1 text-xl font-semibold text-slate-950">Are your social connections decision-ready?</h2>
          <p className="mt-2 text-sm leading-6 text-slate-700">{surface.summary}</p>
          <p className="mt-1 text-sm leading-6 text-slate-600">{surface.detail}</p>
        </div>
        <span className={`inline-flex w-fit rounded-full border px-3 py-1 text-xs font-semibold ${surface.state === "PROVEN" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : surface.state === "UNPROVEN" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-slate-300 bg-slate-100 text-slate-800"}`}>
          {surface.state === "PROVEN" ? "Review available" : surface.state === "UNPROVEN" ? "Live proof missing" : "Unavailable"}
        </span>
      </div>

      {review ? (
        <>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Summary label="Platforms reviewed" value={review.platforms.length} />
            <Summary label="Live first-party" value={review.liveFirstPartyPlatforms.length} />
            <Summary label="Need your action" value={review.platformsNeedingKeeganAction.length} />
            <Summary label="Need engineering" value={review.platformsNeedingEngineeringAction.length} />
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {review.platforms.map((platform) => <PlatformCard key={platform.platform} platform={platform} />)}
          </div>
        </>
      ) : (
        <div className="mt-5 rounded-2xl border border-dashed border-amber-300 bg-amber-50/60 p-4">
          <p className="text-sm font-semibold text-amber-950">What needs to happen next</p>
          <p className="mt-1 text-sm leading-6 text-amber-900">{surface.nextAction}</p>
          <p className="mt-2 text-xs text-amber-800">No platform metrics are shown until live first-party proof passes validation.</p>
        </div>
      )}

      <p className="mt-4 text-xs text-slate-500">Last connector review: {displayTimestamp(surface.generatedAt)}</p>
    </section>
  );
}

function PlatformCard({ platform }: { platform: SocialConnectorHealthPlatformV1 }) {
  const issue = platform.issues[0] ?? null;
  const action = platform.needsKeeganAction
    ? "Connect this account"
    : platform.needsEngineeringAction
      ? "Engineering follow-up required"
      : issue
        ? ISSUE_COPY[issue]
        : "No action required";
  return (
    <article className="rounded-2xl border border-slate-200 bg-[#ffffff] p-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-semibold text-slate-950">{platformLabel(platform.platform)}</h3>
        <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${HEALTH_TONE[platform.sourceHealth]}`}>
          {HEALTH_LABEL[platform.sourceHealth]}
        </span>
      </div>
      <dl className="mt-3 space-y-2 text-sm">
        <Detail label="Canonical data" value={humanize(platform.canonicalDataState)} />
        <Detail label="Latest proof" value={displayTimestamp(platform.latestCanonicalProofAt)} />
        <Detail label="Next step" value={action} />
      </dl>
    </article>
  );
}

function Summary({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">{label}</dt>
      <dd className="mt-0.5 font-medium text-slate-800">{value}</dd>
    </div>
  );
}

function displayTimestamp(value: string | null): string {
  if (!value) return "Not proven";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not proven";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short"
  }).format(date);
}

function platformLabel(value: string): string {
  if (value === "YOUTUBE") return "YouTube";
  if (value === "TIKTOK") return "TikTok";
  if (value === "LINKEDIN") return "LinkedIn";
  if (value === "X") return "X";
  return value.charAt(0) + value.slice(1).toLowerCase();
}

function humanize(value: string): string {
  return value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
