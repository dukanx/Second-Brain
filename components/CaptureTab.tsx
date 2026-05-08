"use client";

import { useState, useRef, useCallback, useMemo } from "react";
import type { Capture } from "./BrainClient";
import { TYPE_COLORS } from "./BrainClient";

const TEMPLATES: { label: string; prefix: string; type: string }[] = [
  { label: "task",     prefix: "[ ] ",    type: "Task"     },
  { label: "idea",     prefix: "Idea: ",  type: "Idea"     },
  { label: "TIL",      prefix: "TIL: ",   type: "Learning" },
  { label: "link",     prefix: "",         type: "Link"     },
  { label: "note",     prefix: "",         type: "Note"     },
];

const PROJECT_COLORS: Record<string, string> = {
  "Village Booker": "text-amber",
  "Glumac Plus": "text-purple",
  FON: "text-blue",
  Personal: "text-green",
  Other: "text-muted",
};

const TYPES = ["All", "Idea", "Link", "Task", "Learning", "Note"];
const PROJECTS = ["All", "Village Booker", "Glumac Plus", "FON", "Personal", "Other"];
type SortKey = "newest" | "oldest" | "connections";

export default function CaptureTab({
  captures,
  setCaptures,
}: {
  captures: Capture[];
  setCaptures: React.Dispatch<React.SetStateAction<Capture[]>>;
}) {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Capture | null>(null);
  const [relateStatus, setRelateStatus] = useState("");
  const [error, setError] = useState("");
  const [recording, setRecording] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);

  // Filters
  const [filterType, setFilterType] = useState("All");
  const [filterProject, setFilterProject] = useState("All");
  const [filterStarred, setFilterStarred] = useState(false);
  const [sort, setSort] = useState<SortKey>("newest");

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const save = useCallback(async () => {
    if (!text.trim() || saving) return;
    setSaving(true);
    setError("");
    setRelateStatus("");
    try {
      const res = await fetch("/api/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");

      setCaptures((prev) => [data.capture, ...prev]);
      setLastSaved(data.capture);
      setText("");
      textareaRef.current?.focus();

      // Relate in background, show feedback
      setRelateStatus("finding connections...");
      fetch("/api/relate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ captureId: data.capture.id }),
      })
        .then((r) => r.json())
        .then((rd) => {
          const count = rd.relatedIds?.length ?? 0;
          setRelateStatus(count > 0 ? `→ ${count} connection${count > 1 ? "s" : ""} found` : "");
          if (count > 0) {
            setCaptures((prev) =>
              prev.map((c) =>
                c.id === data.capture.id ? { ...c, related_ids: rd.relatedIds } : c
              )
            );
          }
          setTimeout(() => setRelateStatus(""), 4000);
        })
        .catch(() => setRelateStatus(""));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }, [text, saving, setCaptures]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && e.ctrlKey) { e.preventDefault(); save(); }
  }

  function applyTemplate(prefix: string) {
    setText((prev) => (prev ? prev : prefix));
    textareaRef.current?.focus();
  }

  function toggleRecording() {
    if (recording) {
      recognitionRef.current?.stop();
      setRecording(false);
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!SR) { setError("Voice not supported in this browser"); return; }
    const r = new SR();
    r.continuous = true;
    r.interimResults = false;
    r.lang = "en-US";
    r.onresult = (e: { results: { [key: number]: { [key: number]: { transcript: string } } } }) => {
      const transcript = Array.from(Object.values(e.results) as { [key: number]: { transcript: string } }[])
        .map((res) => res[0].transcript).join(" ");
      setText((prev) => (prev ? prev + " " + transcript : transcript));
    };
    r.onerror = () => { setRecording(false); };
    r.onend = () => { setRecording(false); };
    recognitionRef.current = r;
    r.start();
    setRecording(true);
  }

  const filtered = useMemo(() => {
    let list = [...captures];
    if (filterStarred) list = list.filter((c) => c.starred);
    if (filterType !== "All") list = list.filter((c) => c.type === filterType);
    if (filterProject !== "All") list = list.filter((c) => c.project === filterProject);
    if (sort === "oldest") list.reverse();
    else if (sort === "connections") list.sort((a, b) => (b.related_ids?.length ?? 0) - (a.related_ids?.length ?? 0));
    return list;
  }, [captures, filterStarred, filterType, filterProject, sort]);

  const isUrl = text.trim().startsWith("http");

  function exportJSON() {
    const blob = new Blob([JSON.stringify(captures, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `second-brain-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportMarkdown() {
    const lines = captures.map((c) => {
      const date = new Date(c.created_at).toLocaleDateString("sr", { day: "2-digit", month: "2-digit", year: "2-digit" });
      const star = c.starred ? " ★" : "";
      return `## ${c.title}${star}\n**Type:** ${c.type} | **Project:** ${c.project} | **Date:** ${date}\n\n${c.text}\n\n---`;
    });
    const md = `# Second Brain Export\n*${new Date().toLocaleDateString()}*\n\n---\n\n${lines.join("\n\n")}`;
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `second-brain-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Input */}
      <div className="bg-surface terminal-border rounded-lg overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-2 border-b border-border">
          <span className="text-amber text-xs">capture</span>
          {isUrl && <span className="text-blue text-xs ml-1">// url detected — AI will fetch metadata</span>}
          <span className="text-muted text-xs ml-auto hidden sm:inline">ctrl+enter to save</span>
        </div>
        <div className="flex gap-1.5 px-4 pt-2 flex-wrap">
          {TEMPLATES.map((t) => (
            <button
              key={t.label}
              onClick={() => applyTemplate(t.prefix)}
              className="text-[10px] px-2 py-0.5 border border-border text-muted rounded hover:text-amber hover:border-amber transition-colors"
            >
              {t.label}
            </button>
          ))}
        </div>
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            e.target.style.height = "auto";
            e.target.style.height = `${e.target.scrollHeight}px`;
          }}
          onKeyDown={handleKeyDown}
          placeholder="// what's on your mind?"
          className="w-full bg-transparent text-text placeholder-muted text-sm p-4 resize-none focus:outline-none min-h-[120px] sm:min-h-[140px] font-mono leading-relaxed"
          autoFocus
          disabled={saving}
        />
        <div className="flex items-center justify-between gap-3 px-4 py-2 border-t border-border">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted">{text.length} chars</span>
            <button
              onClick={toggleRecording}
              title={recording ? "stop recording" : "voice capture"}
              className={`text-sm leading-none transition-colors ${recording ? "text-red-400 animate-pulse" : "text-muted hover:text-amber"}`}
            >
              {recording ? "⏹" : "🎤"}
            </button>
          </div>
          <button
            onClick={save}
            disabled={!text.trim() || saving}
            className="text-xs px-4 py-1.5 bg-amber text-bg rounded font-bold hover:bg-yellow-400 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? "saving..." : "save()"}
          </button>
        </div>
      </div>

      {/* Status */}
      {error && (
        <div className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded px-3 py-2">
          error: {error}
        </div>
      )}

      {lastSaved && !saving && (
        <div className="text-xs bg-green/10 border border-green/20 rounded px-4 py-3 animate-fade-in">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-green">✓</span>
            <span className="text-green font-bold truncate">{lastSaved.title}</span>
          </div>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex gap-3 text-muted">
              <span>type: <span className={TYPE_COLORS[lastSaved.type] ?? "text-muted"}>{lastSaved.type}</span></span>
              <span>project: <span className={PROJECT_COLORS[lastSaved.project] ?? "text-muted"}>{lastSaved.project}</span></span>
            </div>
            {relateStatus && (
              <span className={`text-xs ${relateStatus.startsWith("→") ? "text-purple" : "text-muted animate-pulse"}`}>
                {relateStatus}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Filter bar */}
      <div className="space-y-2">
        {/* Type filter */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          <button
            onClick={() => setFilterStarred((s) => !s)}
            className={`shrink-0 text-xs px-2.5 py-1 rounded border transition-colors ${
              filterStarred
                ? "border-amber text-amber bg-amber/10"
                : "border-border text-muted hover:text-text"
            }`}
          >
            ★
          </button>
          {TYPES.map((t) => (
            <button
              key={t}
              onClick={() => setFilterType(t)}
              className={`shrink-0 text-xs px-2.5 py-1 rounded border transition-colors ${
                filterType === t
                  ? "border-amber text-amber bg-amber/10"
                  : "border-border text-muted hover:text-text"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Project filter + sort */}
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar flex-1">
            {PROJECTS.map((p) => (
              <button
                key={p}
                onClick={() => setFilterProject(p)}
                className={`shrink-0 text-xs px-2.5 py-1 rounded border transition-colors ${
                  filterProject === p
                    ? "border-purple text-purple bg-purple/10"
                    : "border-border text-muted hover:text-text"
                }`}
              >
                {p === "Village Booker" ? "VB" : p === "Glumac Plus" ? "GP" : p}
              </button>
            ))}
          </div>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="shrink-0 text-xs bg-surface border border-border text-muted rounded px-2 py-1 focus:outline-none focus:border-text"
          >
            <option value="newest">newest</option>
            <option value="oldest">oldest</option>
            <option value="connections">connections</option>
          </select>
        </div>
      </div>

      {/* Captures list */}
      <div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted">
            // {filtered.length} of {captures.length} captures
          </span>
          <div className="flex gap-1.5">
            <button
              onClick={exportMarkdown}
              className="text-[10px] text-muted hover:text-text border border-border rounded px-2 py-0.5 transition-colors"
            >
              export .md
            </button>
            <button
              onClick={exportJSON}
              className="text-[10px] text-muted hover:text-text border border-border rounded px-2 py-0.5 transition-colors"
            >
              export .json
            </button>
          </div>
        </div>
        <div className="space-y-2 mt-3">
          {filtered.slice(0, 50).map((capture) => (
            <CaptureCard
              key={capture.id}
              capture={capture}
              onUpdate={(updated) =>
                setCaptures((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))
              }
              onDelete={(id) =>
                setCaptures((prev) => prev.filter((c) => c.id !== id))
              }
              onStar={(id, starred) =>
                setCaptures((prev) => prev.map((c) => (c.id === id ? { ...c, starred } : c)))
              }
            />
          ))}
          {filtered.length === 0 && (
            <p className="text-xs text-muted py-8 text-center">no captures match filters</p>
          )}
        </div>
      </div>
    </div>
  );
}

function CaptureCard({
  capture,
  onUpdate,
  onDelete,
  onStar,
}: {
  capture: Capture;
  onUpdate: (c: Capture) => void;
  onDelete: (id: string) => void;
  onStar: (id: string, starred: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [mode, setMode] = useState<"view" | "edit" | "confirmDelete">("view");
  const [editText, setEditText] = useState(capture.text);
  const [editTitle, setEditTitle] = useState(capture.title);
  const [editType, setEditType] = useState(capture.type);
  const [editProject, setEditProject] = useState(capture.project);
  const [saving, setSaving] = useState(false);

  const date = new Date(capture.created_at).toLocaleDateString("sr", {
    day: "2-digit", month: "2-digit", year: "2-digit",
  });

  async function saveEdit() {
    setSaving(true);
    try {
      const res = await fetch(`/api/capture/${capture.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: editText, title: editTitle, type: editType, project: editProject }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onUpdate(data.capture);
      setMode("view");
    } catch {
      // keep edit mode open on error
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    setSaving(true);
    try {
      const res = await fetch(`/api/capture/${capture.id}`, { method: "DELETE" });
      if (res.ok) onDelete(capture.id);
    } finally {
      setSaving(false);
    }
  }

  function startEdit() {
    setEditText(capture.text);
    setEditTitle(capture.title);
    setEditType(capture.type);
    setEditProject(capture.project);
    setMode("edit");
    setExpanded(true);
  }

  return (
    <div className="bg-surface terminal-border rounded overflow-hidden">
      {/* Card header */}
      <div
        className="flex items-center gap-2 px-4 py-3 cursor-pointer active:bg-border transition-colors"
        onClick={() => mode === "view" && setExpanded((e) => !e)}
      >
        <span className={`text-xs shrink-0 ${TYPE_COLORS[capture.type] ?? "text-muted"}`}>
          [{capture.type}]
        </span>
        <span className="text-sm text-text truncate flex-1">{capture.title}</span>
        <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => {
              const next = !capture.starred;
              onStar(capture.id, next);
              fetch(`/api/capture/${capture.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ starred: next }),
              });
            }}
            className={`text-sm leading-none transition-colors ${capture.starred ? "text-amber" : "text-muted hover:text-amber"}`}
          >
            {capture.starred ? "★" : "☆"}
          </button>
          {capture.related_ids?.length > 0 && (
            <span className="text-xs text-purple">~{capture.related_ids.length}</span>
          )}
          <span className="text-xs text-muted">{date}</span>
          {mode === "view" && (
            <span className="text-xs text-muted">{expanded ? "▴" : "▾"}</span>
          )}
        </div>
      </div>

      {/* Expanded content */}
      {expanded && mode === "view" && (
        <div className="border-t border-border animate-fade-in">
          <div className="px-5 py-5 bg-bg/40">
            <p className="text-sm text-text leading-7 whitespace-pre-wrap">{capture.text}</p>
          </div>
          <div className="flex items-center justify-between px-4 py-3 border-t border-border">
            <div className="flex gap-3 text-xs text-muted">
              <span className={TYPE_COLORS[capture.type] ?? "text-muted"}>{capture.type}</span>
              <span>{capture.project}</span>
              {capture.related_ids?.length > 0 && (
                <span className="text-purple">{capture.related_ids.length} links</span>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={startEdit}
                className="text-xs text-muted hover:text-blue transition-colors px-2 py-0.5 border border-border rounded hover:border-blue"
              >
                edit
              </button>
              <button
                onClick={() => setMode("confirmDelete")}
                className="text-xs text-muted hover:text-red-400 transition-colors px-2 py-0.5 border border-border rounded hover:border-red-400"
              >
                delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit mode */}
      {mode === "edit" && (
        <div className="px-4 pb-4 border-t border-border pt-3 space-y-3 animate-fade-in">
          <input
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            className="w-full bg-bg border border-border rounded px-3 py-2 text-xs text-text focus:outline-none focus:border-amber font-mono"
            placeholder="title"
          />
          <textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            className="w-full bg-bg border border-border rounded px-3 py-2 text-xs text-text focus:outline-none focus:border-amber font-mono resize-none min-h-[80px] leading-relaxed"
          />
          <div className="flex gap-2">
            <select
              value={editType}
              onChange={(e) => setEditType(e.target.value)}
              className="text-xs bg-bg border border-border text-muted rounded px-2 py-1.5 focus:outline-none flex-1"
            >
              {["Idea", "Link", "Task", "Learning", "Note"].map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <select
              value={editProject}
              onChange={(e) => setEditProject(e.target.value)}
              className="text-xs bg-bg border border-border text-muted rounded px-2 py-1.5 focus:outline-none flex-1"
            >
              {["Village Booker", "Glumac Plus", "FON", "Personal", "Other"].map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setMode("view")}
              className="text-xs px-3 py-1.5 border border-border text-muted rounded hover:text-text transition-colors"
            >
              cancel
            </button>
            <button
              onClick={saveEdit}
              disabled={saving}
              className="text-xs px-3 py-1.5 bg-amber text-bg rounded font-bold hover:bg-yellow-400 disabled:opacity-50 transition-colors"
            >
              {saving ? "saving..." : "save()"}
            </button>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {mode === "confirmDelete" && (
        <div className="px-4 py-3 border-t border-border flex items-center justify-between animate-fade-in">
          <span className="text-xs text-red-400">delete this capture?</span>
          <div className="flex gap-2">
            <button
              onClick={() => setMode("view")}
              className="text-xs px-3 py-1 border border-border text-muted rounded hover:text-text transition-colors"
            >
              cancel
            </button>
            <button
              onClick={confirmDelete}
              disabled={saving}
              className="text-xs px-3 py-1 bg-red-500/20 border border-red-500/40 text-red-400 rounded hover:bg-red-500/30 disabled:opacity-50 transition-colors"
            >
              {saving ? "..." : "delete"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
