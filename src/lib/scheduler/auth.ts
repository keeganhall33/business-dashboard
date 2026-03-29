export function assertSchedulerAuth(request: Request) {
  const suppliedSecret = request.headers.get("x-scheduler-secret");
  const expectedSecret = process.env.SCHEDULER_SECRET;

  if (!expectedSecret || suppliedSecret !== expectedSecret) {
    throw new Error("Unauthorized scheduler request");
  }
}
