import { LearningInboxV1 } from "@/components/intelligence/LearningInboxV1";
import { buildLearningInboxV1 } from "@/lib/intelligence/organizational-learning/learning-inbox-v1";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export default function IntelligenceLearningPage() {
  const view = buildLearningInboxV1({
    learning_objects: null,
    command_handler_available: false
  });

  return <LearningInboxV1 view={view} />;
}
