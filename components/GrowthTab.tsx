"use client";

import { useState, useMemo } from "react";
import type { Capture } from "./BrainClient";

const AMBER_SCALE = ["#0d1117", "#f59e0b22", "#f59e0b55", "#f59e0b99", "#f59e0b"];

function dateKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

function buildHeatmap(captures: Capture[], weeks: number) {
  const countByDay: Record<string, number> = {};
  captures.forEach((c) => {
    const k = c.created_at.slice(0, 10);
    countByDay[k] = (countByDay[k] ?? 0) + 1;
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dayOfWeek = today.getDay(); // 0=Sun

  // Build grid: weeks columns × 7 rows (Mon-Sun)
  const grid: { date: string; count: number }[][] = [];
  const totalDays = weeks * 7;
  const startOffset = (dayOfWeek + 6) % 7; // days into current week (Mon-based)

  for (let w = 0; w < weeks; w++) {
    const col: { date: string; count: number }[] = [];
    for (let d = 0; d < 7; d++) {
      const daysAgo = totalDays - 1 - (w * 7 + d) + (6 - startOffset);
      const dt = new Date(today);
      dt.setDate(today.getDate() - daysAgo);
      if (dt > today) { col.push({ date: "", count: -1 }); continue; }
      const k = dateKey(dt);
      col.push({ date: k, count: countByDay[k] ?? 0 });
    }
    grid.push(col);
  }
  return grid;
}

function calcStreak(captures: Capture[]) {
  const days = new Set(captures.map((c) => c.created_at.slice(0, 10)));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let streak = 0;
  let d = new Date(today);
  // allow today or yesterday to start streak
  if (!days.has(dateKey(d))) d.setDate(d.getDate() - 1);
  while (days.has(dateKey(d))) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

function colorForCount(n: number) {
  if (n <= 0) return AMBER_SCALE[0];
  if (n === 1) return AMBER_SCALE[1];
  if (n <= 3) return AMBER_SCALE[2];
  if (n <= 6) return AMBER_SCALE[3];
  return AMBER_SCALE[4];
}

const DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];

export default function GrowthTab({
  captures,
  setCaptures,
}: {
  captures: Capture[];
  setCaptures: React.Dispatch<React.SetStateAction<Capture[]>>;
}) {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const tasks = useMemo(
    () => captures.filter((c) => c.type === "Task").sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    ),
    [captures]
  );

  const streak = useMemo(() => calcStreak(captures), [captures]);

  const thisWeek = useMemo(() => {
    const cutoff = Date.now() - 7 * 86400_000;
    return captures.filter((c) => new Date(c.created_at).getTime() > cutoff).length;
  }, [captures]);

  const thisMonth = useMemo(() => {
    const cutoff = Date.now() - 30 * 86400_000;
    return captures.filter((c) => new Date(c.created_at).getTime() > cutoff).length;
  }, [captures]);

  const heatmap = useMemo(() => buildHeatmap(captures, 26), [captures]);

  const todayKey = dateKey(new Date());
  const todayCount = captures.filter((c) => c.created_at.slice(0, 10) === todayKey).length;

  async function completeTask(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/capture/${id}`, { method: "DELETE" });
      if (res.ok) setCaptures((prev) => prev.filter((c) => c.id !== id));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Stats row */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "today",   value: todayCount,        color: "text-amber"  },
          { label: "7 days",  value: thisWeek,           color: "text-blue"   },
          { label: "30 days", value: thisMonth,          color: "text-green"  },
          { label: "streak",  value: `${streak}d`,      color: "text-purple" },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-surface terminal-border rounded-lg p-3 text-center">
            <p className={`text-xl font-bold ${color}`}>{value}</p>
            <p className="text-xs text-muted mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Heatmap */}
      <div className="bg-surface terminal-border rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs text-muted">// activity — last 26 weeks</p>
          <p className="text-xs text-muted">{captures.length} total captures</p>
        </div>
        <div className="flex gap-1 overflow-x-auto pb-1 no-scrollbar">
          {/* Day labels */}
          <div className="flex flex-col gap-1 shrink-0 mr-1">
            {DAY_LABELS.map((d, i) => (
              <span key={i} className="text-[9px] text-muted h-[11px] flex items-center">{i % 2 === 0 ? d : ""}</span>
            ))}
          </div>
          {/* Grid */}
          {heatmap.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-1 shrink-0">
              {week.map((cell, di) => (
                <div
                  key={di}
                  title={cell.date ? `${cell.date}: ${cell.count} captures` : ""}
                  className="w-[11px] h-[11px] rounded-[2px]"
                  style={{ backgroundColor: cell.count < 0 ? "transparent" : colorForCount(cell.count) }}
                />
              ))}
            </div>
          ))}
        </div>
        {/* Scale */}
        <div className="flex items-center gap-1 mt-2 justify-end">
          <span className="text-[9px] text-muted">less</span>
          {AMBER_SCALE.map((c, i) => (
            <div key={i} className="w-[11px] h-[11px] rounded-[2px]" style={{ backgroundColor: c }} />
          ))}
          <span className="text-[9px] text-muted">more</span>
        </div>
      </div>

      {/* Task manager */}
      <div className="bg-surface terminal-border rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <p className="text-xs text-muted">// open tasks</p>
          <span className="text-xs text-green">{tasks.length} pending</span>
        </div>

        {tasks.length === 0 ? (
          <p className="text-xs text-muted py-6 text-center">no open tasks — add one in capture tab</p>
        ) : (
          <div className="divide-y divide-border">
            {tasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                completing={deletingId === task.id}
                onComplete={() => completeTask(task.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TaskRow({
  task,
  completing,
  onComplete,
}: {
  task: Capture;
  completing: boolean;
  onComplete: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const age = Math.floor((Date.now() - new Date(task.created_at).getTime()) / 86400_000);

  return (
    <div className="px-4 py-3 flex items-start gap-3">
      <button
        onClick={() => (confirm ? onComplete() : setConfirm(true))}
        disabled={completing}
        className={`mt-0.5 w-4 h-4 shrink-0 rounded border transition-colors ${
          confirm
            ? "border-green bg-green/20 text-green"
            : "border-border hover:border-green"
        } flex items-center justify-center text-xs`}
      >
        {confirm && "✓"}
      </button>
      <div className="flex-1 min-w-0">
        <p className={`text-sm text-text leading-snug ${confirm ? "line-through text-muted" : ""}`}>
          {task.title}
        </p>
        {task.text !== task.title && (
          <p className="text-xs text-muted mt-0.5 truncate">{task.text.slice(0, 80)}</p>
        )}
        <div className="flex gap-3 mt-1 text-xs text-muted">
          <span>{task.project}</span>
          <span>{age === 0 ? "today" : age === 1 ? "yesterday" : `${age}d ago`}</span>
        </div>
      </div>
      {confirm && (
        <button onClick={() => setConfirm(false)} className="text-xs text-muted hover:text-text shrink-0">
          cancel
        </button>
      )}
    </div>
  );
}
