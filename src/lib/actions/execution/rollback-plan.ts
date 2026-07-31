export function hasRollbackPlan(payloadJson: Record<string, unknown>): boolean {
  const plan = payloadJson["rollback_plan"];
  return Boolean(plan && typeof plan === "object");
}
