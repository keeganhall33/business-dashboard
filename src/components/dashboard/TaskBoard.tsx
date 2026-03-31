import { TaskSummary } from "@/lib/types/dashboard";
import { TaskCard } from "./TaskCard";

type Props = { tasks: TaskSummary[] };

export function TaskBoard({ tasks }: Props) {
  const columns = {
    critical: tasks.filter((t) => t.priority === "critical" && t.status !== "completed"),
    high: tasks.filter((t) => t.priority === "high" && t.status !== "completed"),
    medium: tasks.filter((t) => t.priority === "medium" && t.status !== "completed"),
    completed: tasks.filter((t) => t.status === "completed")
  };

  return (
    <section className="rounded-3xl border border-zinc-800 bg-zinc-950/90 p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">Task Queue</div>
          <div className="text-lg font-semibold text-zinc-100">{tasks.length} active items</div>
        </div>
        <div className="text-xs text-zinc-500">Critical → Completed</div>
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-2 2xl:grid-cols-4">
        {Object.entries(columns).map(([column, items]) => (
          <div key={column} className="flex h-full flex-col rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
            <div className="flex items-center justify-between text-sm font-semibold capitalize text-zinc-100">
              <span>{column}</span>
              <span className="text-xs text-zinc-500">{items.length}</span>
            </div>
            <div className="mt-4 space-y-4">
              {items.length === 0 ? (
                <div className="text-sm text-zinc-600">No items</div>
              ) : (
                items.map((task) => <TaskCard key={task.id} task={task} />)
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
