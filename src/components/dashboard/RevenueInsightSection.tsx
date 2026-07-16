import { buildRevenueIntelligence } from "@/lib/revenue-intelligence";
import type { RevenueAction, RevenueFact, ScenarioOutlook } from "@/lib/revenue-intelligence";
import type { CommerceTelemetry, WebsiteConversionSnapshot } from "@/lib/types/dashboard";

export function RevenueInsightSection({ snapshot, telemetry }: { snapshot?: WebsiteConversionSnapshot | null; telemetry?: CommerceTelemetry }) {
  const intel = buildRevenueIntelligence({ snapshot, telemetry });

  return (
    <section className="space-y-4 rounded-2xl border border-white/10 bg-black/30 p-4">
      <Header fact={intel.headline} />
      <Drivers drivers={intel.drivers} />
      <Reconciliation entries={intel.reconciliation.entries} note={intel.reconciliation.note} />
      <Actions actions={intel.actions} />
      <Scenario scenario={intel.scenario} />
      {intel.customerMessage ? <InsufficientMessage message={intel.customerMessage} /> : null}
    </section>
  );
}

function Header({ fact }: { fact: RevenueFact | null }) {
  if (!fact) {
    return (
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-zinc-500">Revenue intelligence</div>
        <p className="mt-1 text-sm text-zinc-400">Insufficient evidence for a headline.</p>
      </div>
    );
  }
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-zinc-500">Revenue intelligence</div>
      <p className="mt-1 text-sm text-white">{fact.value}</p>
      <ProvenanceDetails provenance={fact.provenance} />
    </div>
  );
}

function Drivers({ drivers }: { drivers: RevenueFact[] }) {
  if (!drivers.length) return null;
  return (
    <div>
      <div className="text-[11px] uppercase tracking-[0.3em] text-zinc-500">Drivers</div>
      <ul className="mt-2 space-y-2">
        {drivers.map((driver) => (
          <li key={driver.id} className="rounded-xl border border-white/10 bg-black/40 p-3">
            <div className="text-sm font-semibold text-white">{driver.label}</div>
            <p className="text-xs text-zinc-300">{driver.value}</p>
            <ProvenanceDetails provenance={driver.provenance} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function Reconciliation({ entries, note }: { entries: RevenueFact[]; note: string }) {
  if (!entries.length) return null;
  return (
    <div className="rounded-xl border border-white/10 bg-black/40 p-3">
      <div className="text-[11px] uppercase tracking-[0.3em] text-zinc-500">Revenue reconciliation</div>
      <ul className="mt-2 space-y-2">
        {entries.map((entry) => (
          <li key={entry.id}>
            <div className="text-sm font-semibold text-white">{entry.label}</div>
            <div className="text-xs text-zinc-300">{entry.value}</div>
            <ProvenanceDetails provenance={entry.provenance} />
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[11px] text-zinc-500">{note}</p>
    </div>
  );
}

function Actions({ actions }: { actions: RevenueAction[] }) {
  if (!actions.length) {
    return (
      <div className="rounded-xl border border-dashed border-white/10 bg-black/30 p-3 text-sm text-zinc-400">
        No grounded revenue actions surfaced for this range.
      </div>
    );
  }
  return (
    <div>
      <div className="text-[11px] uppercase tracking-[0.3em] text-zinc-500">Grounded actions</div>
      <ul className="mt-2 space-y-3">
        {actions.map((action) => (
          <li key={action.id} className="rounded-xl border border-white/10 bg-black/40 p-3">
            <div className="text-xs font-semibold uppercase tracking-[0.3em] text-zinc-500">{action.urgency}</div>
            <div className="mt-1 text-sm font-semibold text-white">{action.title}</div>
            <p className="text-xs text-zinc-300">{action.recommendation}</p>
            <p className="text-xs text-zinc-300">Expected impact: {action.expectedImpact}</p>
            <ProvenanceDetails provenance={action.provenance} />
            <RuleMetadata action={action} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function Scenario({ scenario }: { scenario: ScenarioOutlook | null }) {
  if (!scenario) return null;
  return (
    <div className="rounded-xl border border-white/10 bg-black/40 p-3">
      <div className="text-[11px] uppercase tracking-[0.3em] text-zinc-500">{scenario.label}</div>
      <p className="mt-1 text-sm text-white">{scenario.summary}</p>
      <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-zinc-400">
        {scenario.assumptions.map((assumption) => (
          <li key={assumption}>{assumption}</li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] text-zinc-500">Review by {scenario.reviewDate}</p>
      <ProvenanceDetails provenance={scenario.provenance} />
    </div>
  );
}

function ProvenanceDetails({ provenance }: { provenance: RevenueFact["provenance"] }) {
  return (
    <div className="mt-2 rounded-lg border border-dashed border-white/10 bg-black/20 p-2 text-[10px] text-zinc-500">
      <div>Source: {provenance.source}</div>
      <div>Inference: {provenance.inferenceType}</div>
      {provenance.measuredInputs.length ? <div>Inputs: {provenance.measuredInputs.join(", ")}</div> : null}
      {provenance.calculation ? <div>Calculation: {provenance.calculation}</div> : null}
      {provenance.dataWindow ? <div>Window: {provenance.dataWindow}</div> : null}
      {provenance.confidence != null ? <div>Confidence: {(provenance.confidence * 100).toFixed(0)}%</div> : null}
      {provenance.caveats?.length ? <div>Caveats: {provenance.caveats.join("; ")}</div> : null}
    </div>
  );
}

function RuleMetadata({ action }: { action: RevenueAction }) {
  return (
    <div className="mt-2 border-t border-white/10 pt-2 text-[10px] text-zinc-500">
      <div>Trigger: {action.rule.trigger}</div>
      <div>Minimum sample: {action.rule.minimumSample}</div>
      <div>Evidence: {action.rule.evidence.join(", ")}</div>
      <div>Suppression: {action.rule.suppression.join(", ")}</div>
      <div>Confidence method: {action.rule.confidenceMethod}</div>
      <div>Expected impact method: {action.rule.expectedImpactMethod}</div>
    </div>
  );
}

function InsufficientMessage({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-dashed border-white/10 bg-black/20 p-3 text-xs text-zinc-400">
      {message}
    </div>
  );
}
