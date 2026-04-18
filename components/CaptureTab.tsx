"use client";

import { useState, useRef, useCallback } from "react";
import type { Capture } from "./BrainClient";
import { TYPE_COLORS } from "./BrainClient";

const PROJECT_COLORS: Record<string, string> = {
  "Village Booker": "text-amber",
  "Glumac Plus": "text-purple",
  FON: "text-blue",
  Personal: "text-green",
  Other: "text-muted",
};

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
  const [error, setError] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const save = useCallback(async () => {
    if (!text.trim() || saving) return;
    setSaving(true);
    setError("");
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
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }, [text, saving, setCaptures]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && e.ctrlKey) {
      e.preventDefault();
      save();
    }
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Input area */}
      <div className="bg-surface terminal-border rounded-lg overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-2 border-b border-border">
          <span className="text-amber text-xs">capture</span>
          <span className="text-muted text-xs ml-auto hidden sm:inline">ctrl+enter to save</span>
        </div>
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="// what's on your mind?"
          className="w-full bg-transparent text-text placeholder-muted text-sm p-4 resize-none focus:outline-none min-h-[120px] sm:min-h-[140px] font-mono leading-relaxed"
          autoFocus
          disabled={saving}
        />
        {/* Footer bar with count + save */}
        <div className="flex items-center justify-between gap-3 px-4 py-2 border-t border-border">
          <span className="text-xs text-muted">{text.length} chars</span>
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
      {saving && (
        <div className="text-xs text-amber animate-pulse-slow flex items-center gap-2">
          <span>▸</span>
          <span>AI categorizing...</span>
        </div>
      )}

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
          <div className="flex gap-3 text-muted flex-wrap">
            <span>
              type: <span className={TYPE_COLORS[lastSaved.type] ?? "text-muted"}>{lastSaved.type}</span>
            </span>
            <span>
              project:{" "}
              <span className={PROJECT_COLORS[lastSaved.project] ?? "text-muted"}>
                {lastSaved.project}
              </span>
            </span>
          </div>
        </div>
      )}

      {/* Captures list */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs text-muted">// recent captures ({captures.length})</span>
        </div>
        <div className="space-y-2">
          {captures.slice(0, 30).map((capture) => (
            <CaptureCard key={capture.id} capture={capture} />
          ))}
          {captures.length === 0 && (
            <p className="text-xs text-muted py-8 text-center">
              no captures yet — start typing above
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function CaptureCard({ capture }: { capture: Capture }) {
  const [expanded, setExpanded] = useState(false);
  const date = new Date(capture.created_at).toLocaleDateString("sr", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });

  return (
    <div
      className="bg-surface terminal-border rounded px-4 py-3 cursor-pointer active:bg-border transition-colors group"
      onClick={() => setExpanded((e) => !e)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`text-xs shrink-0 ${TYPE_COLORS[capture.type] ?? "text-muted"}`}>
            [{capture.type}]
          </span>
          <span className="text-sm text-text truncate">{capture.title}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {capture.related_ids?.length > 0 && (
            <span className="text-xs text-purple">~{capture.related_ids.length}</span>
          )}
          <span className="text-xs text-muted">{date}</span>
          <span className="text-xs text-muted">{expanded ? "▴" : "▾"}</span>
        </div>
      </div>
      {expanded && (
        <div className="mt-3 pt-3 border-t border-border animate-fade-in">
          <p className="text-xs text-muted leading-relaxed whitespace-pre-wrap">{capture.text}</p>
          <div className="mt-2 flex gap-3 text-xs text-muted flex-wrap">
            <span>project: <span className="text-text">{capture.project}</span></span>
            {capture.related_ids?.length > 0 && (
              <span>links: <span className="text-purple">{capture.related_ids.length}</span></span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
