import { ExecutiveLearningWorkspaceV1 } from "@/components/learning/ExecutiveLearningWorkspaceV1";
import {
  buildExecutiveLearningWorkspaceV1,
  type ExecutiveLearningWorkspaceV1 as ExecutiveLearningWorkspaceModelV1
} from "@/lib/learning/executive-learning-v1";
import { loadProductionLearningRecordsV1 } from "@/lib/learning/production-learning-records-v1";

export const dynamic = "force-dynamic";

function buildUnavailableLearningWorkspace(): ExecutiveLearningWorkspaceModelV1 {
  return buildExecutiveLearningWorkspaceV1({ records: null });
}

export default async function LearningPage() {
  const feed = await loadProductionLearningRecordsV1();
  const model =
    feed.status === "AVAILABLE"
      ? buildExecutiveLearningWorkspaceV1({ records: feed.records })
      : buildUnavailableLearningWorkspace();

  return (
    <div
      data-production-learning-status={feed.capability}
      data-production-learning-source="CANONICAL_DURABLE_ACTION"
    >
      <section className="bg-[#f8f4ec] px-4 pt-6 sm:px-6 lg:px-8" aria-label="Learning production status">
        <div className="mx-auto max-w-7xl rounded-2xl border border-stone-200 bg-white px-4 py-3 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-stone-300 bg-stone-50 px-2 py-1 text-[10px] font-semibold text-stone-800">
              {feed.capability.replaceAll("_", " ")}
            </span>
            <span className="text-xs text-stone-600">{feed.reason}</span>
          </div>
          <p className="mt-2 text-xs leading-5 text-stone-500">
            A single observed outcome may create a lesson candidate. It never changes policy without separate governed evidence.
          </p>
        </div>
      </section>

      <ExecutiveLearningWorkspaceV1 model={model} />

      {feed.status === "AVAILABLE" && feed.records.length > 0 ? (
        <section className="bg-[#f8f4ec] px-4 pb-8 sm:px-6 lg:px-8" aria-label="Canonical learning traceability">
          <div className="mx-auto grid max-w-7xl gap-3">
            {feed.records.map((record) => (
              <details key={record.id} className="rounded-2xl border border-stone-200 bg-white p-4">
                <summary className="cursor-pointer text-sm font-semibold text-stone-950">
                  Canonical traceability for action {record.traceability.actionId}
                </summary>
                <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="font-semibold text-stone-500">Recommendation</dt>
                    <dd className="mt-1 text-stone-800">{record.recommendationId ?? "UNKNOWN"}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-stone-500">Success metric</dt>
                    <dd className="mt-1 text-stone-800">{record.successMetric ?? "UNKNOWN"}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-stone-500">Key assumptions</dt>
                    <dd className="mt-1 text-stone-800">
                      {record.keyAssumptions.length ? record.keyAssumptions.join(" · ") : "UNKNOWN"}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-stone-500">Confounders / unknowns</dt>
                    <dd className="mt-1 text-stone-800">
                      {[...record.confounders, ...record.unknowns].join(" · ") || "None recorded"}
                    </dd>
                  </div>
                </dl>
              </details>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
