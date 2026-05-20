"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import type { Capture } from "./BrainClient";
import { TypeIcon } from "./BrainClient";
import Markdown from "./Markdown";
import {
  FileText, ChevronDown, ChevronUp, ChevronLeft, ChevronRight,
  Loader2, ArrowRight, Waves, Square, Eye,
  Sun, CalendarRange, CalendarDays, Flame, LayoutGrid,
  RotateCw, Check, CheckCircle2, ListTodo, Inbox,
} from "lucide-react";

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

  type DigestData = {
    themes: string[];
    momentum?: "high" | "medium" | "low";
    highlights?: string[];
    insight?: string;
    patterns?: string;
    pendingTasks?: { id: string; title: string }[];
    forgottenIdeas?: { id: string; title: string }[];
    suggestion?: string;
  };
  type DigestRecord = { id: string; content: DigestData; created_at: string };
  const [digests, setDigests] = useState<DigestRecord[]>([]);
  const [digestGenerating, setDigestGenerating] = useState(false);
  const [selectedDigest, setSelectedDigest] = useState(0);
  const [digestHistoryOpen, setDigestHistoryOpen] = useState(false);
  const [digestExpanded, setDigestExpanded] = useState(false);

  useEffect(() => {
    fetch("/api/digest")
      .then((r) => r.json())
      .then((d) => { if (d.digests?.length) setDigests(d.digests); });
  }, []);

  async function generateDigest() {
    setDigestGenerating(true);
    try {
      const res = await fetch("/api/digest", { method: "POST" });
      const d = await res.json();
      if (d.themes) {
        const rec: DigestRecord = { id: crypto.randomUUID(), content: d, created_at: d.generatedAt };
        setDigests((prev) => [rec, ...prev]);
        setSelectedDigest(0);
        setDigestExpanded(false);
      }
    } finally {
      setDigestGenerating(false);
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
      {/* Digest */}
      {(() => {
        const shown = digests[selectedDigest];
        const d = shown?.content;
        return (
          <div className="bg-surface terminal-border rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <p className="text-xs text-muted flex items-center gap-1.5"><FileText size={12} strokeWidth={1.75} /> digest</p>
              <div className="flex items-center gap-2">
                {digests.length > 1 && (
                  <button
                    onClick={() => setDigestHistoryOpen((o) => !o)}
                    className="flex items-center gap-1 text-[10px] text-muted hover:text-text border border-border rounded px-2 py-0.5 transition-colors"
                  >
                    history ({digests.length}) {digestHistoryOpen ? <ChevronUp size={11} strokeWidth={2} /> : <ChevronDown size={11} strokeWidth={2} />}
                  </button>
                )}
                <button
                  onClick={generateDigest}
                  disabled={digestGenerating}
                  className="text-xs text-muted hover:text-purple border border-border hover:border-purple rounded px-2 py-0.5 transition-colors disabled:opacity-40"
                >
                  {digestGenerating ? "analyzing..." : shown ? "regenerate" : "generate"}
                </button>
              </div>
            </div>

            {digestHistoryOpen && digests.length > 1 && (
              <div className="border-b border-border divide-y divide-border">
                {digests.map((r, i) => (
                  <button
                    key={r.id}
                    onClick={() => { setSelectedDigest(i); setDigestHistoryOpen(false); setDigestExpanded(false); }}
                    className={`w-full text-left px-4 py-2 text-xs flex items-center justify-between transition-colors ${
                      selectedDigest === i ? "text-purple" : "text-muted hover:text-text"
                    }`}
                  >
                    <span>{new Date(r.created_at).toLocaleDateString("sr", { day: "2-digit", month: "2-digit", year: "2-digit" })}</span>
                    {r.content.momentum && <span>{r.content.momentum} momentum</span>}
                  </button>
                ))}
              </div>
            )}

            {!shown && !digestGenerating && (
              <p className="text-xs text-muted py-6 text-center flex items-center justify-center gap-1.5">
                <FileText size={13} strokeWidth={1.5} /> generate your digest
              </p>
            )}
            {digestGenerating && (
              <p className="text-xs text-muted py-6 text-center flex items-center justify-center gap-1.5">
                <Loader2 size={13} className="animate-spin" strokeWidth={2} /> analyzing your knowledge base...
              </p>
            )}
            {shown && !digestGenerating && (
              <div className="p-4 space-y-3 animate-fade-in">
                {/* Collapsed: momentum + themes + highlights + insight */}
                <div className="flex items-center gap-2 flex-wrap">
                  {d.momentum && (
                    <span className={`text-xs px-2 py-0.5 rounded border ${
                      d.momentum === "high"   ? "border-green/40 text-green bg-green/10" :
                      d.momentum === "medium" ? "border-amber/40 text-amber bg-amber/10" :
                                                "border-muted/40 text-muted"
                    }`}>
                      {d.momentum} momentum
                    </span>
                  )}
                  {d.themes.map((t) => (
                    <span key={t} className="text-xs px-2 py-0.5 rounded border border-purple/30 text-purple bg-purple/10">{t}</span>
                  ))}
                </div>
                {d.highlights && d.highlights.length > 0 && (
                  <ul className="space-y-1">
                    {d.highlights.map((h) => (
                      <li key={h} className="text-xs text-muted flex gap-2">
                        <ArrowRight size={12} className="text-amber shrink-0 mt-0.5" strokeWidth={2} />
                        <span>{h}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {d.insight && (
                  <p className="text-xs text-text/70 border-l-2 border-purple/40 pl-3 leading-relaxed">{d.insight}</p>
                )}

                {/* Expanded: patterns + tasks + ideas + suggestion */}
                {digestExpanded && (
                  <div className="space-y-3 pt-2 border-t border-border animate-fade-in">
                    {d.patterns && (
                      <div>
                        <p className="text-[10px] text-muted mb-1 flex items-center gap-1.5"><Waves size={11} strokeWidth={1.75} /> patterns</p>
                        <p className="text-xs text-text leading-relaxed">{d.patterns}</p>
                      </div>
                    )}
                    {d.pendingTasks && d.pendingTasks.length > 0 && (
                      <div>
                        <p className="text-[10px] text-muted mb-2 flex items-center gap-1.5"><Square size={11} strokeWidth={1.75} /> pending tasks</p>
                        <div className="space-y-1">
                          {d.pendingTasks.map((t) => (
                            <div key={t.id} className="flex items-center gap-2">
                              <Square size={11} className="text-green shrink-0" strokeWidth={1.75} />
                              <span className="text-xs text-text">{t.title}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {d.forgottenIdeas && d.forgottenIdeas.length > 0 && (
                      <div>
                        <p className="text-[10px] text-muted mb-2 flex items-center gap-1.5"><Eye size={11} strokeWidth={1.75} /> worth revisiting</p>
                        <div className="space-y-1">
                          {d.forgottenIdeas.map((idea) => (
                            <div key={idea.id} className="flex items-center gap-2">
                              <Eye size={11} className="text-purple shrink-0" strokeWidth={1.75} />
                              <span className="text-xs text-text">{idea.title}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {d.suggestion && (
                      <div className="border border-blue/20 rounded p-3">
                        <p className="text-[10px] text-blue mb-1 flex items-center gap-1.5"><ArrowRight size={11} strokeWidth={2} /> suggested next action</p>
                        <p className="text-xs text-text leading-relaxed">{d.suggestion}</p>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-between pt-1">
                  <p className="text-[10px] text-muted">
                    {new Date(shown.created_at).toLocaleDateString("sr", { day: "2-digit", month: "2-digit", year: "2-digit" })}
                  </p>
                  <button
                    onClick={() => setDigestExpanded((e) => !e)}
                    className="flex items-center gap-1 text-[10px] text-muted hover:text-text transition-colors"
                  >
                    {digestExpanded ? <><ChevronUp size={11} strokeWidth={2} /> less</> : <><ChevronDown size={11} strokeWidth={2} /> full digest</>}
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { Icon: Sun,           label: "today",   value: todayCount,   color: "text-amber"  },
          { Icon: CalendarRange, label: "7 days",  value: thisWeek,     color: "text-blue"   },
          { Icon: CalendarDays,  label: "30 days", value: thisMonth,    color: "text-green"  },
          { Icon: Flame,         label: "streak",  value: `${streak}d`, color: "text-purple" },
        ].map(({ Icon, label, value, color }) => (
          <div key={label} className="bg-surface terminal-border rounded-lg p-3 text-center">
            <p className={`text-xl font-bold ${color}`}>{value}</p>
            <p className="text-xs text-muted mt-0.5 flex items-center justify-center gap-1">
              <Icon size={11} className={`${color} opacity-70 hidden sm:block`} strokeWidth={2} />{label}
            </p>
          </div>
        ))}
      </div>

      {/* Heatmap */}
      <div className="bg-surface terminal-border rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs text-amber flex items-center gap-1.5"><LayoutGrid size={12} strokeWidth={1.75} /> activity</p>
          <div className="flex items-center gap-2">
            {heatmapView === "month" && (
              <div className="flex items-center gap-1">
                <button onClick={() => setMonthOffset((o) => o - 1)} className="text-muted hover:text-text px-1 flex items-center"><ChevronLeft size={14} strokeWidth={2} /></button>
                <span className="text-xs text-muted w-20 text-center">
                  {monthDate.toLocaleString("en", { month: "short", year: "numeric" })}
                </span>
                <button onClick={() => setMonthOffset((o) => Math.min(0, o + 1))} className="text-muted hover:text-text px-1 flex items-center"><ChevronRight size={14} strokeWidth={2} /></button>
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
          <p className="text-xs text-muted flex items-center gap-1.5"><RotateCw size={12} strokeWidth={1.75} /> review queue</p>
          <span className="text-xs text-purple">{reviewQueue.length} due</span>
        </div>
        {reviewQueue.length === 0 ? (
          <p className="text-xs text-muted py-6 text-center flex items-center justify-center gap-1.5"><CheckCircle2 size={13} className="text-green" strokeWidth={2} /> all caught up — check back tomorrow</p>
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
                        <TypeIcon type={c.type} size={12} className="shrink-0" />
                        <span className="text-sm text-text truncate">{c.title}</span>
                      </div>
                      {!expanded && (
                        <p className="text-xs text-muted leading-relaxed line-clamp-2">{c.text}</p>
                      )}
                      <p className="text-[10px] text-muted mt-1 flex items-center gap-1">
                        {daysSince === null ? "never reviewed" : `reviewed ${daysSince}d ago`}
                        {expanded ? <ChevronUp size={11} strokeWidth={2} /> : <ChevronDown size={11} strokeWidth={2} />}
                      </p>
                    </div>
                    {!expanded && (
                      <button
                        onClick={(e) => { e.stopPropagation(); markReviewed(c.id); }}
                        className="shrink-0 flex items-center gap-1 text-xs px-3 py-1 border border-purple/40 text-purple rounded hover:bg-purple/10 transition-colors mt-0.5"
                      >
                        done <Check size={11} strokeWidth={2.25} />
                      </button>
                    )}
                  </div>
                  {expanded && (
                    <div className="animate-fade-in">
                      <div className="px-5 py-4 bg-bg/40">
                        <Markdown>{c.text}</Markdown>
                      </div>
                      <div className="flex items-center justify-between px-4 py-2 border-t border-border">
                        <div className="flex gap-3 text-[10px] text-muted">
                          <span className={c.type === "Learning" ? "text-purple" : "text-amber"}>{c.type}</span>
                          <span>{c.project}</span>
                          <span>{new Date(c.created_at).toLocaleDateString("sr", { day: "2-digit", month: "2-digit", year: "2-digit" })}</span>
                        </div>
                        <button
                          onClick={() => markReviewed(c.id)}
                          className="flex items-center gap-1 text-xs px-3 py-1 border border-purple/40 text-purple rounded hover:bg-purple/10 transition-colors"
                        >
                          done <Check size={11} strokeWidth={2.25} />
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
          <p className="text-xs text-muted flex items-center gap-1.5"><ListTodo size={12} strokeWidth={1.75} /> open tasks</p>
          <span className="text-xs text-green">{tasks.length} pending</span>
        </div>

        {tasks.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-6 text-muted">
            <Inbox size={20} strokeWidth={1.5} />
            <p className="text-xs">no open tasks — add one in capture tab</p>
          </div>
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
          } flex items-center justify-center`}
        >
          {confirm && <Check size={11} strokeWidth={3} />}
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
            <span className="text-muted flex items-center">{expanded ? <ChevronUp size={11} strokeWidth={2} /> : <ChevronDown size={11} strokeWidth={2} />}</span>
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
                  <div className={`mt-0.5 w-3.5 h-3.5 shrink-0 rounded border flex items-center justify-center transition-colors ${
                    st.done ? "border-green bg-green/20 text-green" : "border-border group-hover:border-green"
                  }`}>
                    {st.done && <Check size={9} strokeWidth={3} />}
                  </div>
                  <p className={`text-xs leading-snug ${st.done ? "line-through text-muted" : "text-text"}`}>
                    {st.text}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-5 py-3 bg-bg/40">
              <Markdown>{task.text}</Markdown>
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
