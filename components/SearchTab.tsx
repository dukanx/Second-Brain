"use client";

import { useState, useRef } from "react";
import type { Capture, Project } from "./BrainClient";
import { TypeIcon } from "./BrainClient";
import CaptureDetailModal from "./CaptureDetailModal";
import { Search, Sparkles, FileText, CornerDownRight, Loader2, Inbox, MessageSquare } from "lucide-react";

type SearchResult = {
  synthesis: string;
  relevantCaptures: Capture[];
  followUpQuestions: string[];
};

export default function SearchTab({
  captures,
  setCaptures,
  projects,
}: {
  captures: Capture[];
  setCaptures: React.Dispatch<React.SetStateAction<Capture[]>>;
  projects: Project[];
}) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [error, setError] = useState("");
  const [modalCapture, setModalCapture] = useState<Capture | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function search(q?: string) {
    const searchQuery = (q ?? query).trim();
    if (!searchQuery || loading) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: searchQuery }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Search failed");
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {modalCapture && (
        <CaptureDetailModal
          capture={modalCapture}
          projects={projects}
          onUpdate={(updated) => {
            setCaptures((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
            setModalCapture(updated);
          }}
          onDelete={(id) => {
            setCaptures((prev) => prev.filter((c) => c.id !== id));
            setModalCapture(null);
          }}
          onClose={() => setModalCapture(null)}
        />
      )}
      {/* Search input */}
      <div className="bg-surface terminal-border rounded-lg overflow-hidden">
        <div className="flex items-center px-4 py-3 gap-3">
          <Search size={14} className="text-blue shrink-0" strokeWidth={2} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
            placeholder="ask your second brain..."
            className="flex-1 bg-transparent text-text placeholder-muted text-sm focus:outline-none font-mono min-w-0"
            autoFocus
            disabled={loading}
          />
        </div>
        {/* Search button as footer — always full-width tap target */}
        <div className="border-t border-border px-4 py-2 flex justify-end">
          <button
            onClick={() => search()}
            disabled={!query.trim() || loading}
            className="flex items-center gap-1.5 text-xs px-4 py-1.5 border border-blue text-blue rounded hover:bg-blue hover:text-bg active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? <Loader2 size={12} className="animate-spin" strokeWidth={2} /> : <Search size={12} strokeWidth={2} />}
            {loading ? "thinking..." : "search()"}
          </button>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="space-y-2">
          <div className="text-xs text-blue animate-pulse-slow flex items-center gap-2">
            <Loader2 size={12} className="animate-spin" strokeWidth={2} />
            <span>synthesizing from {captures.length} captures...</span>
          </div>
          <div className="h-px bg-gradient-to-r from-blue/20 via-purple/20 to-transparent animate-pulse" />
        </div>
      )}

      {error && (
        <div className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded px-3 py-2">
          error: {error}
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="space-y-5 animate-fade-in">
          <div className="bg-surface terminal-border rounded-lg overflow-hidden">
            <div className="px-4 py-2 border-b border-border">
              <span className="text-blue text-xs flex items-center gap-1.5">
                <Sparkles size={12} strokeWidth={2} />
                synthesis
              </span>
            </div>
            <div className="px-4 py-4">
              <p className="text-sm text-text leading-relaxed whitespace-pre-wrap">
                {result.synthesis}
              </p>
            </div>
          </div>

          {result.relevantCaptures.length > 0 && (
            <div>
              <p className="text-xs text-muted mb-3 flex items-center gap-1.5">
                <FileText size={12} strokeWidth={1.75} />
                relevant captures ({result.relevantCaptures.length})
              </p>
              <div className="space-y-2">
                {result.relevantCaptures.map((capture) => (
                  <div
                    key={capture.id}
                    className="bg-surface terminal-border rounded px-4 py-3 cursor-pointer hover:border-text/30 transition-colors"
                    onClick={() => setModalCapture(capture)}
                  >
                    <div className="flex items-start gap-2 mb-1 flex-wrap">
                      <TypeIcon type={capture.type} size={13} className="shrink-0 mt-0.5" />
                      <span className="text-xs text-text font-semibold flex-1 min-w-0">
                        {capture.title}
                      </span>
                      <span className="text-xs text-muted shrink-0">{capture.project}</span>
                    </div>
                    <p className="text-xs text-muted leading-relaxed line-clamp-3">{capture.text}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.followUpQuestions.length > 0 && (
            <div>
              <p className="text-xs text-muted mb-3 flex items-center gap-1.5">
                <CornerDownRight size={12} strokeWidth={1.75} />
                follow-up questions
              </p>
              <div className="space-y-2">
                {result.followUpQuestions.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => { setQuery(q); search(q); }}
                    className="w-full text-left text-xs text-purple bg-surface terminal-border rounded px-4 py-3 hover:border-purple/50 active:bg-border transition-all"
                  >
                    <span className="text-muted mr-2">{i + 1}.</span>
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {!result && !loading && (
        <div className="flex flex-col items-center gap-2 py-8 text-muted">
          {captures.length === 0 ? (
            <>
              <Inbox size={20} strokeWidth={1.5} />
              <p className="text-xs">add some captures first</p>
            </>
          ) : (
            <>
              <MessageSquare size={20} strokeWidth={1.5} />
              <p className="text-xs">{captures.length} captures indexed — ask anything</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
