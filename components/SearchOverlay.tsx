"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import type { Capture, Project } from "./BrainClient";
import { TYPE_COLORS } from "./BrainClient";

function abbrev(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length === 1) return name.slice(0, 3);
  return words.map((w) => w[0]).join("").toUpperCase().slice(0, 3);
}

function match(capture: Capture, words: string[]): boolean {
  const hay = `${capture.title} ${capture.text} ${capture.type} ${capture.project}`.toLowerCase();
  return words.every((w) => hay.includes(w));
}

function highlight(text: string, words: string[]): React.ReactNode {
  if (!words.length) return text;
  const regex = new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  const parts = text.split(regex);
  return parts.map((p, i) =>
    regex.test(p) ? <mark key={i} className="bg-amber/30 text-amber rounded px-0.5">{p}</mark> : p
  );
}

export default function SearchOverlay({
  captures,
  projects,
  onClose,
}: {
  captures: Capture[];
  projects: Project[];
  onClose: () => void;
}) {
  const projectColorMap = useMemo(
    () => Object.fromEntries(projects.map((p) => [p.name, p.color])),
    [projects]
  );
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Capture | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const results = words.length
    ? captures.filter((c) => match(c, words)).slice(0, 12)
    : captures.slice(0, 8);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-start justify-center pt-16 px-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-2xl bg-surface border border-border rounded-xl overflow-hidden shadow-2xl animate-fade-in">
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <span className="text-muted text-sm shrink-0">⌕</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelected(null); }}
            placeholder="instant search..."
            className="flex-1 bg-transparent text-text placeholder-muted text-sm focus:outline-none font-mono"
          />
          {query && (
            <button onClick={() => { setQuery(""); setSelected(null); }} className="text-muted hover:text-text text-xs shrink-0">✕</button>
          )}
          <kbd className="hidden sm:inline text-xs text-muted border border-border rounded px-1.5 py-0.5 shrink-0">esc</kbd>
        </div>

        {/* Results */}
        <div className="max-h-[60vh] overflow-y-auto">
          {selected ? (
            <div className="p-4 animate-fade-in">
              <button onClick={() => setSelected(null)} className="text-xs text-muted hover:text-text mb-3 flex items-center gap-1">
                ← back
              </button>
              <div className="flex items-center gap-2 mb-2">
                <span className={`text-xs ${TYPE_COLORS[selected.type] ?? "text-muted"}`}>[{selected.type}]</span>
                <span className="text-sm text-text font-bold">{selected.title}</span>
                <span className="text-xs text-muted ml-auto">{selected.project}</span>
              </div>
              <p className="text-xs text-muted leading-relaxed whitespace-pre-wrap">{selected.text}</p>
              {selected.related_ids?.length > 0 && (
                <p className="text-xs text-purple mt-2">~{selected.related_ids.length} connections</p>
              )}
            </div>
          ) : (
            <div>
              {results.length === 0 ? (
                <p className="text-xs text-muted py-8 text-center">no results for "{query}"</p>
              ) : (
                results.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setSelected(c)}
                    className="w-full text-left px-4 py-3 hover:bg-border transition-colors border-b border-border/50 last:border-0"
                  >
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`text-xs shrink-0 ${TYPE_COLORS[c.type] ?? "text-muted"}`}>[{c.type}]</span>
                      <span className="text-sm text-text truncate flex-1">
                        {highlight(c.title, words)}
                      </span>
                      <span className="text-xs shrink-0" style={{ color: projectColorMap[c.project] ?? "#6b7280" }}>
                        {abbrev(c.project)}
                      </span>
                    </div>
                    {words.length > 0 && (
                      <p className="text-xs text-muted truncate pl-14">
                        {highlight(c.text.slice(0, 100), words)}
                      </p>
                    )}
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        <div className="px-4 py-2 border-t border-border flex items-center justify-between">
          <span className="text-xs text-muted">
            {words.length ? `${results.length} results` : `${captures.length} captures`}
          </span>
          <span className="text-xs text-muted hidden sm:block">⌘K to toggle</span>
        </div>
      </div>
    </div>
  );
}
