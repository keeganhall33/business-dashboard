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
    <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
      <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">Task Queue</div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-4">
        {Object.entries(columns).map(([column, items]) => (
          <div key={column} className="rounded-2xl bg-zinc-900/60 p-4">
            <div className="text-sm font-medium capitalize text-zinc-100">{column}</div>
            <div className="mt-4 space-y-3">
              {items.length === 0 ? (
                <div className="text-sm text-zinc-600">—</div>
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

