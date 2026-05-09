"use client";

import { useState, useRef, useEffect } from "react";
import type { Capture } from "./BrainClient";

type Message = { role: "user" | "assistant"; content: string };

function findContext(query: string, captures: Capture[], pinned: Capture | null, n = 8) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const rest = pinned ? captures.filter((c) => c.id !== pinned.id) : captures;
  const ranked = words.length
    ? rest
        .map((c) => {
          const hay = `${c.title} ${c.text} ${c.type} ${c.project}`.toLowerCase();
          const score = words.filter((w) => hay.includes(w)).length;
          return { c, score };
        })
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, pinned ? n - 1 : n)
        .map(({ c }) => c)
    : rest.slice(0, pinned ? n - 1 : n);
  return pinned ? [pinned, ...ranked] : ranked;
}

const TYPE_COLOR: Record<string, string> = {
  Idea: "text-amber", Link: "text-blue", Task: "text-green", Learning: "text-purple", Note: "text-muted",
};

export default function ChatTab({
  captures,
  pinnedCapture,
  onMarkReviewed,
}: {
  captures: Capture[];
  pinnedCapture?: Capture | null;
  onMarkReviewed?: (id: string) => void;
}) {
  const [history, setHistory] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Reset when pinned capture changes
  useEffect(() => {
    setHistory([]);
    setReviewed(false);
  }, [pinnedCapture?.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history, loading]);

  function handleMarkReviewed() {
    if (!pinnedCapture) return;
    setReviewed(true);
    onMarkReviewed?.(pinnedCapture.id);
  }

  async function send() {
    const msg = input.trim();
    if (!msg || loading) return;

    const context = findContext(msg, captures, pinnedCapture ?? null)
      .filter((c) => c.id !== pinnedCapture?.id)
      .map((c) => ({ title: c.title, text: c.text, type: c.type, project: c.project }));

    const newHistory: Message[] = [...history, { role: "user", content: msg }];
    setHistory(newHistory);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: msg,
          history,
          context,
          pinnedCapture: pinnedCapture
            ? { title: pinnedCapture.title, text: pinnedCapture.text, type: pinnedCapture.type, project: pinnedCapture.project }
            : null,
        }),
      });
      const data = await res.json();
      if (data.reply) {
        setHistory((h) => [...h, { role: "assistant", content: data.reply }]);
      }
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && e.ctrlKey) { e.preventDefault(); send(); }
  }

  const suggestedQuestions = pinnedCapture
    ? ["Explain this in simple terms", "How does this connect to my other captures?", "What should I do with this?"]
    : ["What have I been learning lately?", "Any pending tasks?", "What ideas do I have about marketing?"];

  return (
    <div className="flex flex-col h-[calc(100vh-10rem)]">
      {/* Pinned capture */}
      {/* Fullscreen expand modal */}
      {expanded && pinnedCapture && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setExpanded(false)}
        >
          <div
            className="w-full max-w-2xl bg-surface border border-border rounded-xl overflow-hidden shadow-2xl animate-fade-in flex flex-col max-h-[85vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-border flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <span className={`text-xs ${TYPE_COLOR[pinnedCapture.type] ?? "text-muted"}`}>[{pinnedCapture.type}]</span>
                <span className="text-xs text-muted">{pinnedCapture.project}</span>
              </div>
              <button onClick={() => setExpanded(false)} className="text-muted hover:text-text text-sm transition-colors">✕</button>
            </div>
            <div className="px-5 py-5 overflow-y-auto flex-1">
              <p className="text-sm text-white font-semibold mb-3">{pinnedCapture.title}</p>
              <p className="text-sm text-white leading-6 whitespace-pre-wrap">{pinnedCapture.text}</p>
            </div>
            <div className="px-5 py-3 border-t border-border shrink-0">
              <button
                onClick={() => setExpanded(false)}
                className="text-xs text-muted hover:text-text transition-colors"
              >
                ← zatvori
              </button>
            </div>
          </div>
        </div>
      )}

      {pinnedCapture && (
        <div className={`mb-3 bg-surface terminal-border rounded-lg overflow-hidden transition-opacity ${reviewed ? "opacity-50" : ""}`}>
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted">// review this capture</span>
              <span className={`text-[10px] ${TYPE_COLOR[pinnedCapture.type] ?? "text-muted"}`}>[{pinnedCapture.type}]</span>
              <span className="text-[10px] text-muted">{pinnedCapture.project}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setExpanded(true)}
                className="text-[10px] text-muted hover:text-text border border-border rounded px-2 py-1 transition-colors"
                title="Expand"
              >
                ⤢
              </button>
              {!reviewed ? (
                <button
                  onClick={handleMarkReviewed}
                  className="text-xs px-3 py-1 border border-purple/40 text-purple rounded hover:bg-purple/10 transition-colors shrink-0"
                >
                  done ✓
                </button>
              ) : (
                <span className="text-[10px] text-green">reviewed ✓</span>
              )}
            </div>
          </div>
          <div className="px-4 py-3 max-h-40 overflow-y-auto">
            <p className="text-sm text-text font-medium mb-1">{pinnedCapture.title}</p>
            <p className="text-xs text-muted leading-relaxed whitespace-pre-wrap">{pinnedCapture.text}</p>
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-3 pb-2">
        {history.length === 0 && (
          <div className="text-center pt-8 space-y-3">
            <p className="text-muted text-xs">
              {pinnedCapture ? "// ask anything about this capture" : "// ask anything about your captures"}
            </p>
            <div className="flex flex-wrap gap-2 justify-center">
              {suggestedQuestions.map((q) => (
                <button
                  key={q}
                  onClick={() => { setInput(q); inputRef.current?.focus(); }}
                  className="text-xs px-3 py-1.5 border border-border text-muted rounded hover:text-text hover:border-text transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {history.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-lg px-3 py-2 text-xs leading-relaxed ${
              msg.role === "user"
                ? "bg-amber/10 border border-amber/20 text-text"
                : "bg-surface terminal-border text-text"
            }`}>
              {msg.role === "assistant" && (
                <span className="text-purple text-[10px] block mb-1">◈ brain</span>
              )}
              <p className="whitespace-pre-wrap">{msg.content}</p>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-surface terminal-border rounded-lg px-3 py-2">
              <span className="text-purple text-[10px] block mb-1">◈ brain</span>
              <span className="text-muted text-xs animate-pulse">thinking...</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="bg-surface terminal-border rounded-lg overflow-hidden mt-3">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={pinnedCapture ? "// ask about this capture..." : "// ask about your knowledge base..."}
          className="w-full bg-transparent text-text placeholder-muted text-sm p-3 resize-none focus:outline-none min-h-[72px] font-mono leading-relaxed"
          disabled={loading}
          autoFocus
        />
        <div className="flex items-center justify-between px-3 py-2 border-t border-border">
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-muted">{captures.length} captures indexed</span>
            {history.length > 0 && (
              <button
                onClick={() => setHistory([])}
                className="text-[10px] text-muted hover:text-red-400 transition-colors"
              >
                clear
              </button>
            )}
          </div>
          <button
            onClick={send}
            disabled={!input.trim() || loading}
            className="text-xs px-4 py-1.5 bg-purple text-bg rounded font-bold hover:bg-violet-400 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? "..." : "ask()"}
          </button>
        </div>
      </div>
    </div>
  );
}
