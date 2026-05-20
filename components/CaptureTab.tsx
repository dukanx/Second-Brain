"use client";

import { useState, useRef, useCallback, useMemo } from "react";
import type { Capture, Project } from "./BrainClient";
import { TYPE_COLORS, TypeIcon } from "./BrainClient";
import {
  Sparkles, Link as LinkIcon, Pencil, Trash2, Download, Check, Star,
  ChevronDown, ChevronUp, MessageSquare, Plus, X, Inbox,
} from "lucide-react";

function abbrev(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length === 1) return name.slice(0, 3);
  return words.map((w) => w[0]).join("").toUpperCase().slice(0, 3);
}

const TEMPLATES: { label: string; prefix: string; type: string }[] = [
  { label: "task",     prefix: "[ ] ",    type: "Task"     },
  { label: "idea",     prefix: "Idea: ",  type: "Idea"     },
  { label: "TIL",      prefix: "TIL: ",   type: "Learning" },
  { label: "link",     prefix: "",         type: "Link"     },
  { label: "note",     prefix: "",         type: "Note"     },
];

const TYPES = ["All", "Idea", "Link", "Task", "Learning", "Note"];
type SortKey = "newest" | "oldest" | "connections";

export default function CaptureTab({
  captures,
  setCaptures,
  projects,
  onProjectCreated,
  onChatAbout,
}: {
  captures: Capture[];
  setCaptures: React.Dispatch<React.SetStateAction<Capture[]>>;
  projects: Project[];
  onProjectCreated: (name: string) => Promise<Project>;
  onChatAbout: (id: string) => void;
}) {
  const [text, setText] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState<"high" | "medium" | "low">("medium");
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Capture | null>(null);
  const [relateStatus, setRelateStatus] = useState("");
  const [error, setError] = useState("");
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [sourceUrl, setSourceUrl] = useState("");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

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
        body: JSON.stringify({ text: text.trim(), due_date: dueDate || undefined, priority: isTaskMode ? priority : undefined, source_url: sourceUrl || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");

      setCaptures((prev) => [data.capture, ...prev]);
      setLastSaved(data.capture);
      setText("");
      setDueDate("");
      setPriority("medium");
      setSourceUrl("");
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
  }, [text, dueDate, priority, saving, setCaptures]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && e.ctrlKey) { e.preventDefault(); save(); }
  }

  function applyTemplate(prefix: string) {
    setText((prev) => {
      const stripped = prev.replace(/^(\[[ x]\] |Idea: |TIL: )/, "");
      return prefix + stripped;
    });
    textareaRef.current?.focus();
  }

  function addSubtask() {
    setText((prev) => {
      const newText = prev.endsWith("\n") ? prev + "[ ] " : prev + "\n[ ] ";
      return newText;
    });
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
        textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
        textareaRef.current.focus();
        textareaRef.current.selectionStart = textareaRef.current.value.length;
        textareaRef.current.selectionEnd = textareaRef.current.value.length;
      }
    }, 0);
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

  async function uploadAudio(file: File) {
    setTranscribing(true);
    setError("");
    // If textarea has a URL, save it as source and clear for transcript
    const currentText = text.trim();
    let urlToLink = sourceUrl;
    if (currentText.startsWith("http") && !currentText.includes("\n")) {
      try { new URL(currentText); urlToLink = currentText; setText(""); } catch { /* not a clean URL */ }
    }
    setSourceUrl(urlToLink);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/transcribe", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Transcription failed");
      setText((prev) => (prev ? prev + "\n\n" + data.transcript : data.transcript));
      textareaRef.current?.focus();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Transcription failed");
    } finally {
      setTranscribing(false);
      if (audioInputRef.current) audioInputRef.current.value = "";
    }
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
  const isTaskMode = text.includes("[ ]") || text.trim().startsWith("[ ]");

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
          <span className="text-amber text-xs flex items-center gap-1.5">
            <Sparkles size={12} strokeWidth={2} />
            capture
          </span>
          {isUrl && (
            <span className="text-blue text-xs ml-1">
              {text.trim().includes("youtube.com") || text.trim().includes("youtu.be")
                ? "// youtube — fetching transcript"
                : "// url — AI will fetch metadata"}
            </span>
          )}
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
          placeholder={transcribing ? "// transcribing audio..." : "// what's on your mind?"}
          className="w-full bg-transparent text-text placeholder-muted text-sm p-4 resize-none focus:outline-none min-h-[120px] sm:min-h-[140px] font-mono leading-relaxed"
          autoFocus
          disabled={saving || transcribing}
        />
        {sourceUrl && (
          <div className="px-4 py-2 border-t border-border flex items-center gap-2">
            <LinkIcon size={11} className="text-muted shrink-0" strokeWidth={1.75} />
            <span className="text-[10px] text-muted">source:</span>
            <span className="text-[10px] text-blue truncate flex-1">{sourceUrl}</span>
            <button
              onClick={() => setSourceUrl("")}
              className="text-muted hover:text-red-400 transition-colors shrink-0 flex items-center"
            ><X size={13} strokeWidth={1.75} /></button>
          </div>
        )}
        {isTaskMode && (
          <div className="px-4 py-2 border-t border-border space-y-2">
            <div className="flex gap-1.5">
              {(["low", "medium", "high"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPriority(p)}
                  className={`flex-1 text-[11px] py-1 rounded border transition-colors ${
                    priority === p
                      ? p === "high"   ? "border-red-400 text-red-400 bg-red-400/10"
                        : p === "medium" ? "border-amber text-amber bg-amber/10"
                        : "border-green text-green bg-green/10"
                      : "border-border text-muted hover:border-text"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                style={{ colorScheme: "dark" }}
                className="flex-1 bg-bg border border-border rounded px-3 py-1.5 text-xs text-text focus:outline-none focus:border-amber transition-colors"
              />
              {dueDate && (
                <button
                  onClick={() => setDueDate("")}
                  className="text-muted hover:text-red-400 transition-colors shrink-0 flex items-center"
                >
                  <X size={13} strokeWidth={1.75} />
                </button>
              )}
            </div>
          </div>
        )}
        <div className="flex items-center justify-between gap-3 px-4 py-2 border-t border-border">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted">{text.length} chars</span>
            <button
              onClick={toggleRecording}
              title={recording ? "stop recording" : "voice capture"}
              className={`text-sm leading-none transition-colors ${recording ? "text-red-400 animate-pulse" : "text-muted hover:text-amber"}`}
            >
              {recording ? (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>
              ) : (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <rect x="9" y="2" width="6" height="12" rx="3"/>
                  <path d="M5 10a7 7 0 0 0 14 0"/>
                  <line x1="12" y1="17" x2="12" y2="22"/>
                  <line x1="9" y1="22" x2="15" y2="22"/>
                </svg>
              )}
            </button>
            <button
              onClick={() => audioInputRef.current?.click()}
              disabled={transcribing || saving}
              title="upload audio for transcription"
              className={`text-sm leading-none transition-colors ${transcribing ? "text-purple animate-pulse" : "text-muted hover:text-purple"}`}
            >
              {transcribing ? (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
              ) : (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="17 8 12 3 7 8"/>
                  <line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
              )}
            </button>
            <input
              ref={audioInputRef}
              type="file"
              accept="audio/mpeg,audio/mp4,audio/wav,audio/x-wav,audio/m4a,audio/x-m4a,.mp3,.m4a,.wav"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadAudio(file);
              }}
            />
          </div>
          <div className="flex items-center gap-2">
            {isTaskMode && (
              <button
                onClick={addSubtask}
                className="flex items-center gap-1 text-[10px] text-muted hover:text-green border border-border hover:border-green rounded px-2 py-1.5 transition-colors"
              >
                <Plus size={11} strokeWidth={2} />
                subtask
              </button>
            )}
            <button
              onClick={save}
              disabled={!text.trim() || saving}
              className="text-xs px-4 py-1.5 bg-amber text-bg rounded font-bold hover:bg-yellow-400 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? "saving..." : "save()"}
            </button>
          </div>
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
            <Check size={13} className="text-green shrink-0" strokeWidth={2.5} />
            <span className="text-green font-bold truncate">{lastSaved.title}</span>
          </div>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex gap-3 text-muted">
              <span>type: <span className={TYPE_COLORS[lastSaved.type] ?? "text-muted"}>{lastSaved.type}</span></span>
              <span>project: <span style={{ color: projects.find((p) => p.name === lastSaved.project)?.color ?? "#6b7280" }}>{lastSaved.project}</span></span>
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
            className={`shrink-0 flex items-center text-xs px-2.5 py-1 rounded border transition-colors ${
              filterStarred
                ? "border-amber text-amber bg-amber/10"
                : "border-border text-muted hover:text-text"
            }`}
          >
            <Star size={12} strokeWidth={1.75} fill={filterStarred ? "currentColor" : "none"} />
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
            {["All", ...projects.map((p) => p.name)].map((name) => {
              const proj = projects.find((p) => p.name === name);
              const active = filterProject === name;
              return (
                <button
                  key={name}
                  onClick={() => setFilterProject(name)}
                  className={`shrink-0 text-xs px-2.5 py-1 rounded border transition-colors ${
                    active ? "bg-surface" : "border-border text-muted hover:text-text"
                  }`}
                  style={active && proj ? {
                    borderColor: proj.color,
                    color: proj.color,
                    backgroundColor: proj.color + "1a",
                  } : active ? { borderColor: "#a78bfa", color: "#a78bfa", backgroundColor: "#a78bfa1a" } : {}}
                >
                  {name === "All" ? "All" : abbrev(name)}
                </button>
              );
            })}
            <NewProjectButton onCreated={(p) => { onProjectCreated(p); }} />
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
              className="flex items-center gap-1 text-[10px] text-muted hover:text-text border border-border rounded px-2 py-0.5 transition-colors"
            >
              <Download size={10} strokeWidth={1.75} />
              .md
            </button>
            <button
              onClick={exportJSON}
              className="flex items-center gap-1 text-[10px] text-muted hover:text-text border border-border rounded px-2 py-0.5 transition-colors"
            >
              <Download size={10} strokeWidth={1.75} />
              .json
            </button>
          </div>
        </div>
        <div className="space-y-2 mt-3">
          {filtered.slice(0, 50).map((capture) => (
            <CaptureCard
              key={capture.id}
              capture={capture}
              projects={projects}
              onProjectCreated={onProjectCreated}
              onUpdate={(updated) =>
                setCaptures((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))
              }
              onDelete={(id) =>
                setCaptures((prev) => prev.filter((c) => c.id !== id))
              }
              onStar={(id, starred) =>
                setCaptures((prev) => prev.map((c) => (c.id === id ? { ...c, starred } : c)))
              }
              onChatAbout={onChatAbout}
            />
          ))}
          {filtered.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-8 text-muted">
              <Inbox size={20} strokeWidth={1.5} />
              <p className="text-xs">no captures match filters</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CaptureCard({
  capture,
  projects,
  onProjectCreated,
  onUpdate,
  onDelete,
  onStar,
  onChatAbout,
}: {
  capture: Capture;
  projects: Project[];
  onProjectCreated: (name: string) => Promise<Project>;
  onUpdate: (c: Capture) => void;
  onDelete: (id: string) => void;
  onStar: (id: string, starred: boolean) => void;
  onChatAbout: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [mode, setMode] = useState<"view" | "edit" | "confirmDelete">("view");
  const [editText, setEditText] = useState(capture.text);
  const [editTitle, setEditTitle] = useState(capture.title);
  const [editType, setEditType] = useState(capture.type);
  const [editProject, setEditProject] = useState(capture.project);
  const [addingProject, setAddingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
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
        <TypeIcon type={capture.type} size={14} className="shrink-0" />
        <span className="text-sm text-text truncate flex-1">{capture.title}</span>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={(e) => {
              e.stopPropagation();
              const next = !capture.starred;
              onStar(capture.id, next);
              fetch(`/api/capture/${capture.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ starred: next }),
              });
            }}
            className={`flex items-center transition-colors ${capture.starred ? "text-amber" : "text-muted hover:text-amber"}`}
          >
            <Star size={14} strokeWidth={1.75} fill={capture.starred ? "currentColor" : "none"} />
          </button>
          {capture.related_ids?.length > 0 && (
            <span className={`text-xs text-purple ${expanded ? "" : "hidden sm:inline"}`}>~{capture.related_ids.length}</span>
          )}
          <span className={`text-xs text-muted ${expanded ? "" : "hidden sm:inline"}`}>{date}</span>
          {mode === "view" && (
            <span className="text-muted flex items-center">
              {expanded ? <ChevronUp size={12} strokeWidth={2} /> : <ChevronDown size={12} strokeWidth={2} />}
            </span>
          )}
        </div>
      </div>

      {/* Expanded content */}
      {expanded && mode === "view" && (
        <div className="border-t border-border animate-fade-in">
          <div className="px-5 py-5 bg-bg/40">
            {capture.type === "Link" && (() => {
              const url = capture.text.match(/https?:\/\/[^\s]+/)?.[0];
              return url ? (
                <a href={url} target="_blank" rel="noopener noreferrer"
                  className="text-xs text-blue hover:underline break-all block mb-3"
                  onClick={(e) => e.stopPropagation()}
                >
                  {url}
                </a>
              ) : null;
            })()}
            <p className="text-sm text-text leading-7 whitespace-pre-wrap">{capture.text}</p>
          </div>
          <div className="flex items-center justify-between px-4 py-3 border-t border-border">
            <div className="flex gap-3 text-xs text-muted">
              <span className={TYPE_COLORS[capture.type] ?? "text-muted"}>{capture.type}</span>
              <span style={{ color: projects.find((p) => p.name === capture.project)?.color ?? "#6b7280" }}>{capture.project}</span>
              {capture.related_ids?.length > 0 && (
                <span className="text-purple">{capture.related_ids.length} links</span>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => onChatAbout(capture.id)}
                className="flex items-center gap-1 text-xs text-muted hover:text-purple transition-colors px-2 py-0.5 border border-border rounded hover:border-purple"
              >
                <MessageSquare size={11} strokeWidth={1.75} />
                <span className="hidden sm:inline">chat</span>
              </button>
              <button
                onClick={startEdit}
                className="flex items-center gap-1 text-xs text-muted hover:text-blue transition-colors px-2 py-0.5 border border-border rounded hover:border-blue"
              >
                <Pencil size={11} strokeWidth={1.75} />
                <span className="hidden sm:inline">edit</span>
              </button>
              <button
                onClick={() => setMode("confirmDelete")}
                className="flex items-center gap-1 text-xs text-muted hover:text-red-400 transition-colors px-2 py-0.5 border border-border rounded hover:border-red-400"
              >
                <Trash2 size={11} strokeWidth={1.75} />
                <span className="hidden sm:inline">delete</span>
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
            {addingProject ? (
              <input
                autoFocus
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                onKeyDown={async (e) => {
                  if (e.key === "Enter" && newProjectName.trim()) {
                    const proj = await onProjectCreated(newProjectName.trim());
                    setEditProject(proj.name);
                    setAddingProject(false);
                    setNewProjectName("");
                  } else if (e.key === "Escape") {
                    setAddingProject(false);
                    setNewProjectName("");
                  }
                }}
                onBlur={async () => {
                  if (newProjectName.trim()) {
                    const proj = await onProjectCreated(newProjectName.trim());
                    setEditProject(proj.name);
                  }
                  setAddingProject(false);
                  setNewProjectName("");
                }}
                className="text-xs bg-bg border border-amber rounded px-2 py-1.5 focus:outline-none flex-1 text-text font-mono"
                placeholder="new project name..."
              />
            ) : (
              <select
                value={editProject}
                onChange={(e) => {
                  if (e.target.value === "__new__") setAddingProject(true);
                  else setEditProject(e.target.value);
                }}
                className="text-xs bg-bg border border-border text-muted rounded px-2 py-1.5 focus:outline-none flex-1"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.name}>{p.name}</option>
                ))}
                <option value="__new__">+ new project...</option>
              </select>
            )}
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

function NewProjectButton({ onCreated }: { onCreated: (name: string) => void }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function submit() {
    if (value.trim()) { onCreated(value.trim()); }
    setValue("");
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 0); }}
        className="shrink-0 flex items-center text-xs px-2 py-1 rounded border border-dashed border-border text-muted hover:text-text hover:border-text transition-colors"
        title="Add project"
      >
        <Plus size={12} strokeWidth={2} />
      </button>
    );
  }

  return (
    <input
      ref={inputRef}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") submit();
        if (e.key === "Escape") { setValue(""); setOpen(false); }
      }}
      onBlur={submit}
      className="shrink-0 text-xs px-2.5 py-1 rounded border border-amber text-text bg-bg focus:outline-none w-28 font-mono"
      placeholder="project name"
    />
  );
}
