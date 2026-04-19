"use client";

import { useState, useRef, useEffect } from "react";
import type { Capture } from "./BrainClient";

type Message = { role: "user" | "assistant"; content: string };

function findContext(query: string, captures: Capture[], n = 8) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return captures.slice(0, n);
  return captures
    .map((c) => {
      const hay = `${c.title} ${c.text} ${c.type} ${c.project}`.toLowerCase();
      const score = words.filter((w) => hay.includes(w)).length;
      return { c, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
    .map(({ c }) => c);
}

export default function ChatTab({ captures }: { captures: Capture[] }) {
  const [history, setHistory] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history, loading]);

  async function send() {
    const msg = input.trim();
    if (!msg || loading) return;

    const context = findContext(msg, captures).map((c) => ({
      title: c.title,
      text: c.text,
      type: c.type,
      project: c.project,
    }));

    const newHistory: Message[] = [...history, { role: "user", content: msg }];
    setHistory(newHistory);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg, history, context }),
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

  return (
    <div className="flex flex-col h-[calc(100vh-10rem)]">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-3 pb-2">
        {history.length === 0 && (
          <div className="text-center pt-12 space-y-3">
            <p className="text-muted text-xs">// ask anything about your captures</p>
            <div className="flex flex-wrap gap-2 justify-center">
              {[
                "What have I been learning lately?",
                "Any pending tasks?",
                "What ideas do I have about marketing?",
              ].map((q) => (
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
          placeholder="// ask about your knowledge base..."
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
