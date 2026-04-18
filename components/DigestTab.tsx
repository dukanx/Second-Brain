"use client";

import { useState, useEffect } from "react";
import type { Capture } from "./BrainClient";

type DigestData = {
  themes: string[];
  pendingTasks: { id: string; title: string }[];
  forgottenIdeas: { id: string; title: string }[];
  patterns: string;
  suggestion: string;
  generatedAt: string;
  total: number;
};

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h

function cacheKey(userId: string) {
  return `sb_digest_${userId}`;
}

function loadCache(userId: string): DigestData | null {
  try {
    const raw = localStorage.getItem(cacheKey(userId));
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL_MS) return null;
    return data;
  } catch {
    return null;
  }
}

function saveCache(userId: string, data: DigestData) {
  try {
    localStorage.setItem(cacheKey(userId), JSON.stringify({ data, ts: Date.now() }));
  } catch {}
}

export default function DigestTab({
  captures,
  userId,
}: {
  captures: Capture[];
  userId: string;
}) {
  const [digest, setDigest] = useState<DigestData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Load from cache on mount
  useEffect(() => {
    const cached = loadCache(userId);
    if (cached) setDigest(cached);
  }, [userId]);

  async function generate() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/digest", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setDigest(data);
      saveCache(userId, data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  // Stats computed client-side
  const byType = captures.reduce<Record<string, number>>((acc, c) => {
    acc[c.type] = (acc[c.type] ?? 0) + 1;
    return acc;
  }, {});
  const byProject = captures.reduce<Record<string, number>>((acc, c) => {
    acc[c.project] = (acc[c.project] ?? 0) + 1;
    return acc;
  }, {});

  const TYPE_COLOR: Record<string, string> = {
    Idea: "#fbbf24", Link: "#38bdf8", Task: "#4ade80", Learning: "#c084fc", Note: "#94a3b8",
  };
  const PROJECT_COLOR: Record<string, string> = {
    "Village Booker": "#f59e0b", "Glumac Plus": "#a78bfa",
    FON: "#60a5fa", Personal: "#34d399", Other: "#6b7280",
  };

  const timeAgo = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const h = Math.floor(diff / 3600000);
    if (h < 1) return "just now";
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  };

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header + stats */}
      <div className="bg-surface terminal-border rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm text-text font-bold">daily digest</h2>
            <p className="text-xs text-muted mt-0.5">
              {captures.length} captures · AI synthesis of your knowledge base
            </p>
          </div>
          <button
            onClick={generate}
            disabled={loading || captures.length === 0}
            className="text-xs px-4 py-2 bg-amber text-bg rounded font-bold hover:bg-yellow-400 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? "analyzing..." : digest ? "regenerate()" : "generate()"}
          </button>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs text-muted mb-2">by type</p>
            <div className="space-y-1">
              {Object.entries(byType)
                .sort(([, a], [, b]) => b - a)
                .map(([type, count]) => (
                  <div key={type} className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-border rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${(count / captures.length) * 100}%`,
                          backgroundColor: TYPE_COLOR[type] ?? "#94a3b8",
                        }}
                      />
                    </div>
                    <span className="text-xs shrink-0" style={{ color: TYPE_COLOR[type] ?? "#94a3b8" }}>
                      {type} <span className="text-muted">{count}</span>
                    </span>
                  </div>
                ))}
            </div>
          </div>
          <div>
            <p className="text-xs text-muted mb-2">by project</p>
            <div className="space-y-1">
              {Object.entries(byProject)
                .sort(([, a], [, b]) => b - a)
                .map(([proj, count]) => (
                  <div key={proj} className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-border rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${(count / captures.length) * 100}%`,
                          backgroundColor: PROJECT_COLOR[proj] ?? "#6b7280",
                        }}
                      />
                    </div>
                    <span className="text-xs shrink-0" style={{ color: PROJECT_COLOR[proj] ?? "#6b7280" }}>
                      {proj === "Village Booker" ? "VB" : proj === "Glumac Plus" ? "GP" : proj}{" "}
                      <span className="text-muted">{count}</span>
                    </span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded px-3 py-2">
          error: {error}
        </div>
      )}

      {loading && (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-surface terminal-border rounded-lg p-4 animate-pulse">
              <div className="h-3 bg-border rounded w-24 mb-3" />
              <div className="h-2 bg-border rounded w-full mb-2" />
              <div className="h-2 bg-border rounded w-3/4" />
            </div>
          ))}
        </div>
      )}

      {digest && !loading && (
        <div className="space-y-4 animate-fade-in">
          {/* Themes */}
          <div className="bg-surface terminal-border rounded-lg p-4">
            <p className="text-xs text-muted mb-3">// recurring themes</p>
            <div className="flex flex-wrap gap-2">
              {digest.themes.map((theme, i) => (
                <span
                  key={i}
                  className="text-xs px-3 py-1 rounded-full border border-amber/30 text-amber bg-amber/5"
                >
                  {theme}
                </span>
              ))}
            </div>
          </div>

          {/* Patterns */}
          <div className="bg-surface terminal-border rounded-lg p-4">
            <p className="text-xs text-muted mb-2">// patterns noticed</p>
            <p className="text-sm text-text leading-relaxed">{digest.patterns}</p>
          </div>

          {/* Pending tasks */}
          {digest.pendingTasks?.length > 0 && (
            <div className="bg-surface terminal-border rounded-lg p-4">
              <p className="text-xs text-muted mb-3">
                // pending tasks <span className="text-green">{digest.pendingTasks.length}</span>
              </p>
              <div className="space-y-2">
                {digest.pendingTasks.map((t) => (
                  <div key={t.id} className="flex items-center gap-2">
                    <span className="text-green text-xs shrink-0">□</span>
                    <span className="text-xs text-text">{t.title}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Forgotten ideas */}
          {digest.forgottenIdeas?.length > 0 && (
            <div className="bg-surface terminal-border rounded-lg p-4">
              <p className="text-xs text-muted mb-3">
                // worth revisiting <span className="text-purple">{digest.forgottenIdeas.length}</span>
              </p>
              <div className="space-y-2">
                {digest.forgottenIdeas.map((idea) => (
                  <div key={idea.id} className="flex items-center gap-2">
                    <span className="text-purple text-xs shrink-0">◈</span>
                    <span className="text-xs text-text">{idea.title}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Suggestion */}
          <div className="bg-surface border border-blue/20 rounded-lg p-4">
            <p className="text-xs text-blue mb-2">// suggested next action</p>
            <p className="text-sm text-text leading-relaxed">{digest.suggestion}</p>
          </div>

          <p className="text-xs text-muted text-center">
            generated {timeAgo(digest.generatedAt)} · cached 6h
          </p>
        </div>
      )}

      {!digest && !loading && (
        <p className="text-xs text-muted py-8 text-center">
          {captures.length === 0
            ? "add some captures first"
            : "tap generate() to analyze your knowledge base"}
        </p>
      )}
    </div>
  );
}
