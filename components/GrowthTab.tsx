"use client";

import { useState, useMemo, useEffect } from "react";
import type { Capture } from "./BrainClient";

const AMBER_SCALE = ["#0d1117", "#f59e0b22", "#f59e0b55", "#f59e0b99", "#f59e0b"];

function dateKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

function buildMonthGrid(captures: Capture[], year: number, month: number) {
  const countByDay: Record<string, number> = {};
  captures.forEach((c) => {
    const k = c.created_at.slice(0, 10);
    countByDay[k] = (countByDay[k] ?? 0) + 1;
  });

  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  // Mon-based offset (0=Mon ... 6=Sun)
  const startOffset = (firstDay.getDay() + 6) % 7;

  const cells: { day: number | null; date: string; count: number }[] = [];
  for (let i = 0; i < startOffset; i++) cells.push({ day: null, date: "", count: 0 });
  for (let d = 1; d <= daysInMonth; d++) {
    const date = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    cells.push({ day: d, date, count: countByDay[date] ?? 0 });
  }
  // pad to full weeks
  while (cells.length % 7 !== 0) cells.push({ day: null, date: "", count: 0 });
  // split into rows
  const rows: typeof cells[] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  return rows;
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
  const [reviewedIds, setReviewedIds] = useState<Set<string>>(new Set());

  type WeeklySummary = {
    highlights: string[];
    themes: string[];
    insight: string;
    momentum: "high" | "medium" | "low";
  };
  const [weekly, setWeekly] = useState<WeeklySummary | null>(null);
  const [weeklyAt, setWeeklyAt] = useState<string | null>(null);
  const [weeklyGenerating, setWeeklyGenerating] = useState(false);

  useEffect(() => {
    fetch("/api/summary/weekly")
      .then((r) => r.json())
      .then((d) => { if (d.summary) { setWeekly(d.summary); setWeeklyAt(d.generatedAt); } });
  }, []);

  async function generateWeekly() {
    setWeeklyGenerating(true);
    try {
      const res = await fetch("/api/summary/weekly", { method: "POST" });
      const d = await res.json();
      if (d.summary) { setWeekly(d.summary); setWeeklyAt(d.generatedAt); }
    } finally {
      setWeeklyGenerating(false);
    }
  }

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

  const heatmap = useMemo(() => buildHeatmap(captures, 52), [captures]);

  const [heatmapView, setHeatmapView] = useState<"year" | "month">("year");
  const [monthOffset, setMonthOffset] = useState(0); // 0 = current month
  const monthDate = useMemo(() => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() + monthOffset);
    return d;
  }, [monthOffset]);
  const monthGrid = useMemo(
    () => buildMonthGrid(captures, monthDate.getFullYear(), monthDate.getMonth()),
    [captures, monthDate]
  );

  const todayKey = dateKey(new Date());
  const todayCount = captures.filter((c) => c.created_at.slice(0, 10) === todayKey).length;

  const reviewQueue = useMemo(() => {
    const cutoff = Date.now() - 7 * 86400_000;
    return captures
      .filter((c) => ["Learning", "Idea"].includes(c.type))
      .filter((c) => !reviewedIds.has(c.id))
      .filter((c) => !c.last_reviewed_at || new Date(c.last_reviewed_at).getTime() < cutoff)
      .sort((a, b) => {
        const at = a.last_reviewed_at ? new Date(a.last_reviewed_at).getTime() : 0;
        const bt = b.last_reviewed_at ? new Date(b.last_reviewed_at).getTime() : 0;
        return at - bt;
      })
      .slice(0, 5);
  }, [captures, reviewedIds]);

  async function markReviewed(id: string) {
    const now = new Date().toISOString();
    setReviewedIds((prev) => new Set([...prev, id]));
    setCaptures((prev) => prev.map((c) => c.id === id ? { ...c, last_reviewed_at: now } : c));
    fetch(`/api/capture/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ last_reviewed_at: now }),
    });
  }

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
      {/* Weekly summary */}
      <div className="bg-surface terminal-border rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <p className="text-xs text-muted">// this week</p>
          <div className="flex items-center gap-3">
            {weeklyAt && (
              <span className="text-[10px] text-muted">
                {new Date(weeklyAt).toLocaleDateString("sr", { day: "2-digit", month: "2-digit" })}
              </span>
            )}
            <button
              onClick={generateWeekly}
              disabled={weeklyGenerating}
              className="text-xs text-muted hover:text-purple border border-border hover:border-purple rounded px-2 py-0.5 transition-colors disabled:opacity-40"
            >
              {weeklyGenerating ? "generating..." : weekly ? "regenerate" : "generate"}
            </button>
          </div>
        </div>

        {!weekly && !weeklyGenerating && (
          <p className="text-xs text-muted py-6 text-center">generate your weekly summary</p>
        )}
        {weeklyGenerating && (
          <p className="text-xs text-muted py-6 text-center animate-pulse">analyzing this week...</p>
        )}
        {weekly && !weeklyGenerating && (
          <div className="p-4 space-y-3 animate-fade-in">
            {/* Momentum + themes */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-xs px-2 py-0.5 rounded border ${
                weekly.momentum === "high"   ? "border-green/40 text-green bg-green/10" :
                weekly.momentum === "medium" ? "border-amber/40 text-amber bg-amber/10" :
                                               "border-muted/40 text-muted"
              }`}>
                {weekly.momentum} momentum
              </span>
              {weekly.themes.map((t) => (
                <span key={t} className="text-xs px-2 py-0.5 rounded border border-purple/30 text-purple bg-purple/10">
                  {t}
                </span>
              ))}
            </div>
            {/* Highlights */}
            <ul className="space-y-1">
              {weekly.highlights.map((h) => (
                <li key={h} className="text-xs text-muted flex gap-2">
                  <span className="text-amber shrink-0">→</span>
                  <span>{h}</span>
                </li>
              ))}
            </ul>
            {/* Insight */}
            <p className="text-xs text-text/70 border-l-2 border-purple/40 pl-3 leading-relaxed">
              {weekly.insight}
            </p>
          </div>
        )}
      </div>

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
          <p className="text-xs text-amber">// activity</p>
          <div className="flex items-center gap-2">
            {heatmapView === "month" && (
              <div className="flex items-center gap-1">
                <button onClick={() => setMonthOffset((o) => o - 1)} className="text-muted hover:text-text text-xs px-1">◂</button>
                <span className="text-xs text-muted w-20 text-center">
                  {monthDate.toLocaleString("en", { month: "short", year: "numeric" })}
                </span>
                <button onClick={() => setMonthOffset((o) => Math.min(0, o + 1))} className="text-muted hover:text-text text-xs px-1">▸</button>
              </div>
            )}
            {heatmapView === "year" && (
              <span className="text-xs text-muted">last 52 weeks</span>
            )}
            <div className="flex border border-border rounded overflow-hidden">
              <button
                onClick={() => setHeatmapView("month")}
                className={`text-[10px] px-2 py-0.5 transition-colors ${heatmapView === "month" ? "bg-amber text-bg font-bold" : "text-muted hover:text-text"}`}
              >month</button>
              <button
                onClick={() => setHeatmapView("year")}
                className={`text-[10px] px-2 py-0.5 transition-colors ${heatmapView === "year" ? "bg-amber text-bg font-bold" : "text-muted hover:text-text"}`}
              >year</button>
            </div>
          </div>
        </div>
        {heatmapView === "year" && (
          <>
            <div className="flex gap-1 overflow-x-auto pb-1 no-scrollbar">
              <div className="flex flex-col shrink-0 mr-1 mt-4">
                {DAY_LABELS.map((d, i) => (
                  <span key={i} className="text-[9px] text-muted leading-none mb-[3px] h-[11px] flex items-center">
                    {i % 2 === 0 ? d : ""}
                  </span>
                ))}
              </div>
              <div className="flex flex-col gap-0">
                <div className="flex gap-1 mb-1">
                  {heatmap.map((week, wi) => {
                    const firstValid = week.find((c) => c.date);
                    const day = firstValid?.date ? new Date(firstValid.date + "T00:00:00").getDate() : null;
                    const month = firstValid?.date
                      ? new Date(firstValid.date + "T00:00:00").toLocaleString("en", { month: "short" })
                      : null;
                    return (
                      <div key={wi} className="w-[11px] shrink-0 text-[8px] text-muted text-center leading-none">
                        {day !== null && day <= 7 ? month : ""}
                      </div>
                    );
                  })}
                </div>
                <div className="flex gap-1">
                  {heatmap.map((week, wi) => (
                    <div key={wi} className="flex flex-col gap-[3px] shrink-0">
                      {week.map((cell, di) => (
                        <div
                          key={di}
                          title={cell.date ? `${cell.date}: ${cell.count} capture${cell.count !== 1 ? "s" : ""}` : ""}
                          className="w-[11px] h-[11px] rounded-[2px] cursor-default"
                          style={{ backgroundColor: cell.count < 0 ? "transparent" : colorForCount(cell.count) }}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}

        {heatmapView === "month" && (
          <div className="max-w-xs mx-auto sm:max-w-sm">
            <div className="grid grid-cols-7 mb-1">
              {DAY_LABELS.map((d, i) => (
                <div key={i} className="text-[10px] text-muted text-center py-1">{d}</div>
              ))}
            </div>
            <div className="space-y-1">
              {monthGrid.map((row, ri) => (
                <div key={ri} className="grid grid-cols-7 gap-1">
                  {row.map((cell, ci) => (
                    <div
                      key={ci}
                      title={cell.date ? `${cell.date}: ${cell.count} capture${cell.count !== 1 ? "s" : ""}` : ""}
                      className={`aspect-square rounded flex items-center justify-center text-[11px] font-mono transition-colors ${
                        !cell.day ? "opacity-0" :
                        cell.date === todayKey ? "ring-1 ring-amber" : ""
                      }`}
                      style={{ backgroundColor: cell.day ? colorForCount(cell.count) : "transparent" }}
                    >
                      {cell.day && (
                        <span className={cell.count > 0 ? "text-bg font-bold" : "text-muted"}>
                          {cell.day}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Legend */}
        <div className="flex items-center justify-between mt-3">
          <div className="flex items-center gap-2 text-[9px] text-muted">
            <span className="w-[11px] h-[11px] rounded-[2px] inline-block" style={{ backgroundColor: AMBER_SCALE[0] }} />
            <span>0</span>
            <span className="w-[11px] h-[11px] rounded-[2px] inline-block" style={{ backgroundColor: AMBER_SCALE[1] }} />
            <span>1</span>
            <span className="w-[11px] h-[11px] rounded-[2px] inline-block" style={{ backgroundColor: AMBER_SCALE[2] }} />
            <span>2–3</span>
            <span className="w-[11px] h-[11px] rounded-[2px] inline-block" style={{ backgroundColor: AMBER_SCALE[3] }} />
            <span>4–6</span>
            <span className="w-[11px] h-[11px] rounded-[2px] inline-block" style={{ backgroundColor: AMBER_SCALE[4] }} />
            <span>7+</span>
          </div>
          <span className="text-[9px] text-muted">Mon → Sun</span>
        </div>
      </div>

      {/* Spaced repetition */}
      <div className="bg-surface terminal-border rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <p className="text-xs text-muted">// review queue</p>
          <span className="text-xs text-purple">{reviewQueue.length} due</span>
        </div>
        {reviewQueue.length === 0 ? (
          <p className="text-xs text-muted py-6 text-center">all caught up — check back tomorrow</p>
        ) : (
          <div className="divide-y divide-border">
            {reviewQueue.map((c) => {
              const daysSince = c.last_reviewed_at
                ? Math.floor((Date.now() - new Date(c.last_reviewed_at).getTime()) / 86400_000)
                : null;
              return (
                <div key={c.id} className="px-4 py-3 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[10px] shrink-0 ${c.type === "Learning" ? "text-purple" : "text-amber"}`}>
                        [{c.type}]
                      </span>
                      <span className="text-sm text-text truncate">{c.title}</span>
                    </div>
                    <p className="text-xs text-muted leading-relaxed line-clamp-2">{c.text}</p>
                    <p className="text-[10px] text-muted mt-1">
                      {daysSince === null ? "never reviewed" : `reviewed ${daysSince}d ago`}
                    </p>
                  </div>
                  <button
                    onClick={() => markReviewed(c.id)}
                    className="shrink-0 text-xs px-3 py-1 border border-purple/40 text-purple rounded hover:bg-purple/10 transition-colors"
                  >
                    done ✓
                  </button>
                </div>
              );
            })}
          </div>
        )}
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
