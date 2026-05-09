"use client";

import { useState, useMemo, useEffect, useRef } from "react";
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
  taskId,
}: {
  captures: Capture[];
  setCaptures: React.Dispatch<React.SetStateAction<Capture[]>>;
  taskId?: string | null;
}) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [reviewedIds, setReviewedIds] = useState<Set<string>>(new Set());
  const [expandedReviewId, setExpandedReviewId] = useState<string | null>(null);
  const heatmapScrollRef = useRef<HTMLDivElement>(null);

  type WeeklySummary = {
    highlights: string[];
    themes: string[];
    insight: string;
    momentum: "high" | "medium" | "low";
  };
  type WeeklyRecord = { content: WeeklySummary; created_at: string; week_start: string };
  const [weeklies, setWeeklies] = useState<WeeklyRecord[]>([]);
  const [weeklyGenerating, setWeeklyGenerating] = useState(false);
  const [selectedWeek, setSelectedWeek] = useState(0);
  const [weeklyHistoryOpen, setWeeklyHistoryOpen] = useState(false);

  useEffect(() => {
    fetch("/api/summary/weekly")
      .then((r) => r.json())
      .then((d) => { if (d.summaries?.length) setWeeklies(d.summaries); });
  }, []);

  async function generateWeekly() {
    setWeeklyGenerating(true);
    try {
      const res = await fetch("/api/summary/weekly", { method: "POST" });
      const d = await res.json();
      if (d.summary) {
        const rec: WeeklyRecord = { content: d.summary, created_at: d.generatedAt, week_start: d.generatedAt.slice(0, 10) };
        setWeeklies((prev) => [rec, ...prev.filter((w) => w.week_start !== rec.week_start)]);
        setSelectedWeek(0);
      }
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

  useEffect(() => {
    if (heatmapView === "year" && heatmapScrollRef.current) {
      heatmapScrollRef.current.scrollLeft = heatmapScrollRef.current.scrollWidth;
    }
  }, [heatmapView]);

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

  function updateTaskText(id: string, text: string) {
    setCaptures((prev) => prev.map((c) => c.id === id ? { ...c, text } : c));
    fetch(`/api/capture/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Weekly summary */}
      {(() => {
        const shown = weeklies[selectedWeek];
        return (
          <div className="bg-surface terminal-border rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <p className="text-xs text-muted">// weekly summary</p>
              <div className="flex items-center gap-2">
                {weeklies.length > 1 && (
                  <button
                    onClick={() => setWeeklyHistoryOpen((o) => !o)}
                    className="text-[10px] text-muted hover:text-text border border-border rounded px-2 py-0.5 transition-colors"
                  >
                    history ({weeklies.length}) {weeklyHistoryOpen ? "▴" : "▾"}
                  </button>
                )}
                <button
                  onClick={generateWeekly}
                  disabled={weeklyGenerating}
                  className="text-xs text-muted hover:text-purple border border-border hover:border-purple rounded px-2 py-0.5 transition-colors disabled:opacity-40"
                >
                  {weeklyGenerating ? "generating..." : shown ? "regenerate" : "generate"}
                </button>
              </div>
            </div>

            {weeklyHistoryOpen && weeklies.length > 1 && (
              <div className="border-b border-border divide-y divide-border">
                {weeklies.map((w, i) => (
                  <button
                    key={w.week_start}
                    onClick={() => { setSelectedWeek(i); setWeeklyHistoryOpen(false); }}
                    className={`w-full text-left px-4 py-2 text-xs flex items-center justify-between transition-colors ${
                      selectedWeek === i ? "text-purple" : "text-muted hover:text-text"
                    }`}
                  >
                    <span>week of {new Date(w.week_start + "T12:00:00").toLocaleDateString("en", { day: "2-digit", month: "short" })}</span>
                    <span>{w.content.momentum} momentum</span>
                  </button>
                ))}
              </div>
            )}

            {!shown && !weeklyGenerating && (
              <p className="text-xs text-muted py-6 text-center">generate your weekly summary</p>
            )}
            {weeklyGenerating && (
              <p className="text-xs text-muted py-6 text-center animate-pulse">analyzing this week...</p>
            )}
            {shown && !weeklyGenerating && (
              <div className="p-4 space-y-3 animate-fade-in">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-xs px-2 py-0.5 rounded border ${
                    shown.content.momentum === "high"   ? "border-green/40 text-green bg-green/10" :
                    shown.content.momentum === "medium" ? "border-amber/40 text-amber bg-amber/10" :
                                                          "border-muted/40 text-muted"
                  }`}>
                    {shown.content.momentum} momentum
                  </span>
                  {shown.content.themes.map((t) => (
                    <span key={t} className="text-xs px-2 py-0.5 rounded border border-purple/30 text-purple bg-purple/10">{t}</span>
                  ))}
                </div>
                <ul className="space-y-1">
                  {shown.content.highlights.map((h) => (
                    <li key={h} className="text-xs text-muted flex gap-2">
                      <span className="text-amber shrink-0">→</span>
                      <span>{h}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-text/70 border-l-2 border-purple/40 pl-3 leading-relaxed">
                  {shown.content.insight}
                </p>
                <p className="text-[10px] text-muted text-right">
                  {new Date(shown.created_at).toLocaleDateString("sr", { day: "2-digit", month: "2-digit", year: "2-digit" })}
                </p>
              </div>
            )}
          </div>
        );
      })()}

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
            <div ref={heatmapScrollRef} className="flex gap-1 overflow-x-auto pb-1 no-scrollbar">
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
              const expanded = expandedReviewId === c.id;
              return (
                <div key={c.id} className="border-b border-border last:border-0">
                  <div
                    className="px-4 py-3 flex items-start gap-3 cursor-pointer active:bg-border transition-colors"
                    onClick={() => setExpandedReviewId(expanded ? null : c.id)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-[10px] shrink-0 ${c.type === "Learning" ? "text-purple" : "text-amber"}`}>
                          [{c.type}]
                        </span>
                        <span className="text-sm text-text truncate">{c.title}</span>
                      </div>
                      {!expanded && (
                        <p className="text-xs text-muted leading-relaxed line-clamp-2">{c.text}</p>
                      )}
                      <p className="text-[10px] text-muted mt-1">
                        {daysSince === null ? "never reviewed" : `reviewed ${daysSince}d ago`}
                        <span className="ml-2">{expanded ? "▴" : "▾"}</span>
                      </p>
                    </div>
                    {!expanded && (
                      <button
                        onClick={(e) => { e.stopPropagation(); markReviewed(c.id); }}
                        className="shrink-0 text-xs px-3 py-1 border border-purple/40 text-purple rounded hover:bg-purple/10 transition-colors mt-0.5"
                      >
                        done ✓
                      </button>
                    )}
                  </div>
                  {expanded && (
                    <div className="animate-fade-in">
                      <div className="px-5 py-4 bg-bg/40">
                        <p className="text-sm text-text leading-7 whitespace-pre-wrap">{c.text}</p>
                      </div>
                      <div className="flex items-center justify-between px-4 py-2 border-t border-border">
                        <div className="flex gap-3 text-[10px] text-muted">
                          <span className={c.type === "Learning" ? "text-purple" : "text-amber"}>{c.type}</span>
                          <span>{c.project}</span>
                          <span>{new Date(c.created_at).toLocaleDateString("sr", { day: "2-digit", month: "2-digit", year: "2-digit" })}</span>
                        </div>
                        <button
                          onClick={() => markReviewed(c.id)}
                          className="text-xs px-3 py-1 border border-purple/40 text-purple rounded hover:bg-purple/10 transition-colors"
                        >
                          done ✓
                        </button>
                      </div>
                    </div>
                  )}
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
                onTextUpdate={updateTaskText}
                initialExpanded={task.id === taskId}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const PRIORITY_STYLE: Record<string, string> = {
  high:   "text-red-400 border-red-400/40 bg-red-400/10",
  medium: "text-amber border-amber/40 bg-amber/10",
  low:    "text-green border-green/40 bg-green/10",
};

function dueDateLabel(due: string | null): { label: string; color: string } | null {
  if (!due) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(due + "T00:00:00");
  const diff = Math.round((d.getTime() - today.getTime()) / 86400_000);
  if (diff < 0)  return { label: `overdue ${Math.abs(diff)}d`, color: "text-red-400" };
  if (diff === 0) return { label: "due today", color: "text-amber" };
  if (diff === 1) return { label: "due tomorrow", color: "text-amber" };
  return { label: `due in ${diff}d`, color: "text-muted" };
}

function parseSubtasks(text: string) {
  return text.split("\n")
    .map((line, idx) => {
      const m = line.match(/^(\s*)\[([ x])\] (.+)$/);
      if (!m) return null;
      return { idx, done: m[2] === "x", text: m[3] };
    })
    .filter(Boolean) as { idx: number; done: boolean; text: string }[];
}

function toggleSubtask(text: string, lineIdx: number): string {
  return text.split("\n").map((line, i) => {
    if (i !== lineIdx) return line;
    return line.includes("[ ]") ? line.replace("[ ]", "[x]") : line.replace("[x]", "[ ]");
  }).join("\n");
}

function TaskRow({
  task,
  completing,
  onComplete,
  onTextUpdate,
  initialExpanded,
}: {
  task: Capture;
  completing: boolean;
  onComplete: () => void;
  onTextUpdate: (id: string, text: string) => void;
  initialExpanded?: boolean;
}) {
  const [confirm, setConfirm] = useState(false);
  const [expanded, setExpanded] = useState(initialExpanded ?? false);
  const [localText, setLocalText] = useState(task.text);
  const age = Math.floor((Date.now() - new Date(task.created_at).getTime()) / 86400_000);
  const subtasks = parseSubtasks(localText);
  const due = dueDateLabel(task.due_date);

  function handleSubtaskToggle(e: React.MouseEvent, lineIdx: number) {
    e.stopPropagation();
    const newText = toggleSubtask(localText, lineIdx);
    setLocalText(newText);
    onTextUpdate(task.id, newText);
  }

  return (
    <div className={`border-b border-border last:border-0 transition-opacity duration-500 ${completing ? "opacity-40" : "opacity-100"}`}>
      <div
        className="px-4 py-3 flex items-start gap-3 cursor-pointer active:bg-border transition-colors"
        onClick={() => !confirm && setExpanded((e) => !e)}
      >
        <button
          onClick={(e) => { e.stopPropagation(); confirm ? onComplete() : setConfirm(true); }}
          disabled={completing}
          className={`mt-0.5 w-4 h-4 shrink-0 rounded border transition-colors ${
            confirm ? "border-green bg-green/20 text-green" : "border-border hover:border-green"
          } flex items-center justify-center text-xs`}
        >
          {confirm && "✓"}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <p className={`text-sm leading-snug ${confirm ? "line-through text-muted" : "text-text"}`}>
              {task.title}
            </p>
            {task.priority && task.priority !== "medium" && (
              <span className={`text-[10px] px-1.5 py-0 rounded border ${PRIORITY_STYLE[task.priority]}`}>
                {task.priority}
              </span>
            )}
          </div>
          {!expanded && subtasks.length === 0 && task.text !== task.title && (
            <p className="text-xs text-muted mt-0.5 truncate">{task.text.slice(0, 80)}</p>
          )}
          {!expanded && subtasks.length > 0 && (
            <p className="text-xs text-muted mt-0.5">
              {subtasks.filter((s) => s.done).length}/{subtasks.length} done
            </p>
          )}
          <div className="flex gap-3 mt-1 text-[10px] flex-wrap">
            <span className="text-muted">{task.project}</span>
            <span className="text-muted">{age === 0 ? "today" : age === 1 ? "yesterday" : `${age}d ago`}</span>
            {due && <span className={due.color}>{due.label}</span>}
            <span className="text-muted">{expanded ? "▴" : "▾"}</span>
          </div>
        </div>
        {confirm && (
          <button
            onClick={(e) => { e.stopPropagation(); setConfirm(false); }}
            className="text-xs text-muted hover:text-text shrink-0"
          >
            cancel
          </button>
        )}
      </div>
      {expanded && (
        <div className="animate-fade-in">
          {subtasks.length > 0 ? (
            <div className="px-5 py-3 bg-bg/40 space-y-2">
              {subtasks.map((st) => (
                <div
                  key={st.idx}
                  className="flex items-start gap-2 cursor-pointer group"
                  onClick={(e) => handleSubtaskToggle(e, st.idx)}
                >
                  <div className={`mt-0.5 w-3.5 h-3.5 shrink-0 rounded border flex items-center justify-center text-[10px] transition-colors ${
                    st.done ? "border-green bg-green/20 text-green" : "border-border group-hover:border-green"
                  }`}>
                    {st.done && "✓"}
                  </div>
                  <p className={`text-xs leading-snug ${st.done ? "line-through text-muted" : "text-text"}`}>
                    {st.text}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-5 py-3 bg-bg/40">
              <p className="text-sm text-text leading-7 whitespace-pre-wrap">{task.text}</p>
            </div>
          )}
          <div className="flex items-center gap-3 px-4 py-2 border-t border-border text-[10px] text-muted">
            <span>{task.project}</span>
            {due && <span className={due.color}>{due.label}</span>}
            {task.priority && <span className={PRIORITY_STYLE[task.priority]?.split(" ")[0]}>{task.priority} priority</span>}
          </div>
        </div>
      )}
    </div>
  );
}
