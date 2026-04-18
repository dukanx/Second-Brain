"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense } from "react";

function ShareForm() {
  const params = useSearchParams();
  const router = useRouter();
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const title = params.get("title") ?? "";
    const body = params.get("text") ?? "";
    const url = params.get("url") ?? "";
    const parts = [title, body, url].filter(Boolean);
    setText(parts.join("\n").trim());
    textareaRef.current?.focus();
  }, [params]);

  async function save() {
    if (!text.trim() || saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.trim() }),
      });
      if (res.ok) {
        setDone(true);
        setTimeout(() => router.push("/brain"), 1200);
      }
    } finally {
      setSaving(false);
    }
  }

  if (done) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="text-center space-y-2">
          <p className="text-green text-2xl">✓</p>
          <p className="text-xs text-muted">saved — returning to brain...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-lg bg-surface terminal-border rounded-xl overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <span className="text-amber">▣</span>
          <span className="text-amber font-bold text-sm">second_brain</span>
          <span className="text-muted text-xs ml-2">// shared capture</span>
        </div>
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="w-full bg-transparent text-text text-sm p-4 resize-none focus:outline-none min-h-[160px] font-mono leading-relaxed placeholder-muted"
          placeholder="// edit before saving..."
        />
        <div className="flex items-center justify-between px-4 py-3 border-t border-border gap-3">
          <button
            onClick={() => router.push("/brain")}
            className="text-xs text-muted hover:text-text transition-colors"
          >
            cancel
          </button>
          <button
            onClick={save}
            disabled={!text.trim() || saving}
            className="text-xs px-4 py-1.5 bg-amber text-bg rounded font-bold hover:bg-yellow-400 disabled:opacity-40 transition-all"
          >
            {saving ? "saving..." : "save()"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SharePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-bg" />}>
      <ShareForm />
    </Suspense>
  );
}
