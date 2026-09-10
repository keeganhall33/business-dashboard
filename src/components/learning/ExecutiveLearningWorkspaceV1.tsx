import type {
  ExecutiveLearningRecordV1,
  ExecutiveLearningWorkspaceV1,
  LearningEvidenceStateV1
} from "@/lib/learning/executive-learning-v1";

const EVIDENCE_STYLE: Record<LearningEvidenceStateV1, string> = {
  KNOWN: "border-emerald-200 bg-emerald-50 text-emerald-900",
  INFERRED: "border-sky-200 bg-sky-50 text-sky-900",
  UNKNOWN: "border-amber-200 bg-amber-50 text-amber-900",
  STALE: "border-orange-200 bg-orange-50 text-orange-900",
  CONFLICTED: "border-rose-200 bg-rose-50 text-rose-900"
};

function display(value: string | number | null): string {
  return value == null ? "Unavailable" : String(value);
}

function Metric({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-500">{label}</dt>
      <dd className="mt-1 text-xl font-semibold text-stone-950">{display(value)}</dd>
    </div>
  );
}

function EvidenceBadge({ state }: { state: LearningEvidenceStateV1 }) {
  return (
    <span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold ${EVIDENCE_STYLE[state]}`}>
      {state}
    </span>
  );
}

function LearningRecord({ record }: { record: ExecutiveLearningRecordV1 }) {
  return (
    <article className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm" data-learning-record-id={record.id}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <EvidenceBadge state={record.evidenceState} />
          <span className="rounded-full border border-stone-200 bg-stone-50 px-2 py-1 text-[10px] font-semibold text-stone-700">
            {record.evaluationState.replaceAll("_", " ")}
          </span>
        </div>
        <span className="text-xs font-medium text-stone-500">Action: {record.actionStatus.replaceAll("_", " ")}</span>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-500">Hypothesis</p>
          <p className="mt-1 text-sm font-semibold leading-6 text-stone-950">{display(record.hypothesis)}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-500">Prediction</p>
          <p className="mt-1 text-sm leading-6 text-stone-800">{display(record.prediction)}</p>
        </div>
      </div>

      <dl className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl bg-stone-50 p-3">
          <dt className="text-[10px] font-semibold uppercase tracking-[0.1em] text-stone-500">Confidence</dt>
          <dd className="mt-1 text-sm font-medium text-stone-900">{display(record.confidence)}</dd>
        </div>
        <div className="rounded-2xl bg-stone-50 p-3">
          <dt className="text-[10px] font-semibold uppercase tracking-[0.1em] text-stone-500">Evaluation window</dt>
          <dd className="mt-1 text-sm font-medium text-stone-900">{display(record.evaluationWindow)}</dd>
        </div>
        <div className="rounded-2xl bg-stone-50 p-3">
          <dt className="text-[10px] font-semibold uppercase tracking-[0.1em] text-stone-500">Attribution confidence</dt>
          <dd className="mt-1 text-sm font-medium text-stone-900">{display(record.attributionConfidence)}</dd>
        </div>
      </dl>

      <div className="mt-4 border-t border-stone-100 pt-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-500">Observed outcome</p>
        <p className="mt-1 text-sm leading-6 text-stone-800">{display(record.observedOutcome)}</p>
      </div>

      <details className="mt-4 rounded-2xl border border-stone-200 bg-[#fffdf8] p-4">
        <summary className="cursor-pointer text-sm font-semibold text-stone-950">Learning detail</summary>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold text-stone-500">Lesson</dt>
            <dd className="mt-1 text-sm leading-6 text-stone-800">{display(record.lesson)}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-stone-500">Calibration error</dt>
            <dd className="mt-1 text-sm leading-6 text-stone-800">{display(record.calibrationError)}</dd>
          </div>
        </dl>
        <p className="mt-3 text-xs leading-5 text-stone-500">
          Outcome and attribution evidence are displayed separately. This workspace does not infer causation from outcome alone.
        </p>
      </details>

      {record.verificationRequired ? (
        <p className="mt-3 text-xs font-medium text-amber-800">Verification is required before treating this record as durable learning.</p>
      ) : null}
    </article>
  );
}

export function ExecutiveLearningWorkspaceV1({ model }: { model: ExecutiveLearningWorkspaceV1 }) {
  return (
    <main className="min-h-screen bg-[#f8f4ec] px-4 py-6 text-stone-950 sm:px-6 lg:px-8" data-testid="executive-learning-workspace-v1" data-visual-mode="light">
      <div className="mx-auto max-w-7xl">
        <header className="rounded-[2rem] border border-stone-200 bg-[#fffdf8] p-5 shadow-sm md:p-7">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Learning</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">Predictions → outcomes → lessons</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">
                See what was expected, what was observed, and whether the evidence is strong enough to become durable learning.
              </p>
            </div>
            <a href="/dashboard" className="w-fit rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-800">Executive Home</a>
          </div>
        </header>

        <section className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-5" aria-label="Learning summary">
          <Metric label="Records" value={model.summary.recordCount} />
          <Metric label="Pending" value={model.summary.pendingCount} />
          <Metric label="Outcomes" value={model.summary.outcomeRecordedCount} />
          <Metric label="Lessons" value={model.summary.learningRecordedCount} />
          <Metric label="Needs verification" value={model.summary.verificationRequiredCount} />
        </section>

        {model.coverage === "UNAVAILABLE" ? (
          <section className="mt-5 rounded-3xl border border-amber-200 bg-amber-50 p-6 shadow-sm" data-testid="learning-coverage-unavailable">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-amber-300 bg-white px-2 py-1 text-[10px] font-semibold text-amber-900">COVERAGE UNAVAILABLE</span>
              <span className="text-xs font-medium text-amber-900">No synthetic records substituted</span>
            </div>
            <h2 className="mt-3 text-xl font-semibold text-stone-950">Canonical learning evidence is not connected yet</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-700">{model.coverageReason}</p>
            <p className="mt-3 text-sm font-medium text-stone-800">Next safe step: connect a verified canonical learning-record adapter before displaying current business outcomes or lessons.</p>
          </section>
        ) : model.records.length === 0 ? (
          <section className="mt-5 rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold">No learning records in the verified feed</h2>
            <p className="mt-2 text-sm leading-6 text-stone-600">{model.coverageReason}</p>
          </section>
        ) : (
          <section className="mt-5" aria-label="Prediction and outcome records">
            <div className="mb-3 flex items-end justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">Evaluation queue</h2>
                <p className="mt-1 text-sm text-stone-600">Prediction, outcome, attribution, and lesson remain separate evidence fields.</p>
              </div>
            </div>
            <div className="grid gap-4 xl:grid-cols-2">
              {model.records.map((record) => <LearningRecord key={record.id} record={record} />)}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
