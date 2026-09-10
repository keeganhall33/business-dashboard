import { ExecutiveLearningWorkspaceV1 } from "@/components/learning/ExecutiveLearningWorkspaceV1";
import { buildExecutiveLearningWorkspaceV1 } from "@/lib/learning/executive-learning-v1";

export default function LearningPage() {
  const model = buildExecutiveLearningWorkspaceV1({ records: null });
  return <ExecutiveLearningWorkspaceV1 model={model} />;
}
