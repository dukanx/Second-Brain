import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { logQuery } from "@/lib/queryLog";
import { retrieveCaptures } from "@/lib/retrieval";
import { generateText, isRateLimited } from "@/lib/llm";

// How many captures to retrieve as context for each chat message.
const CONTEXT_COUNT = 8;
// Vector search returns more candidates; the reranker keeps the best CONTEXT_COUNT
// (vector top 15 + rerank is the setup measured on the retrieval eval).
const RERANK_CANDIDATES = 15;
// Per-capture text in the context. The reranker picks good captures, so give
// the model more than the first sentence; 8 × 500 chars stays well within the
// 8K tokens/minute limit together with the pinned capture and history.
const CONTEXT_CHARS = 500;

type Message = { role: "user" | "assistant"; content: string };
type ContextCapture = { title: string; text: string; type: string; project: string };

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { message, history, pinnedCapture } = await request.json() as {
    message: string;
    history: Message[];
    pinnedCapture?: (ContextCapture & { id: string }) | null;
  };

  // RAG retrieval for the current message. Only this message is embedded, so a
  // vague follow-up ("tell me more") retrieves poorly; the pinned capture covers
  // the common case.
  const { captures: context, fallback } = await retrieveCaptures(supabase, user.id, message, {
    candidates: RERANK_CANDIDATES,
    keep: CONTEXT_COUNT,
    excludeId: pinnedCapture?.id ?? null,
    label: "chat",
  });

  await logQuery(supabase, {
    userId: user.id,
    source: "chat",
    query: message,
    retrievedIds: context.map((c) => c.id),
    fallback,
  });

  const pinnedText = pinnedCapture
    ? pinnedCapture.text.length > 2000
      ? pinnedCapture.text.slice(0, 2000) + "\n\n[... transcript truncated — ask about specific parts if needed]"
      : pinnedCapture.text
    : "";
  const pinnedBlock = pinnedCapture
    ? `The user is currently reviewing this specific capture. When they say "this", "it", or ask about the topic without specifying, they mean THIS capture:\n\n[${pinnedCapture.type}][${pinnedCapture.project}] ${pinnedCapture.title}\n${pinnedText}\n\n`
    : "";

  const contextBlock = context.length > 0
    ? `Additional captures from their knowledge base:\n${context.map((c) => `[${c.type}][${c.project}] ${c.title}: ${c.text.slice(0, CONTEXT_CHARS)}`).join("\n")}`
    : "";

  const recentHistory = history.slice(-6);

  try {
    const reply = await generateText({
      maxTokens: 1500,
      system: `You are a helpful assistant for a personal knowledge base. Answer concisely based on the user's captures, in the language the user writes in. If the answer isn't in the captures, say so briefly.

${pinnedBlock}${contextBlock}`.trim(),
      messages: [...recentHistory, { role: "user", content: message }],
    });
    return NextResponse.json({ reply });
  } catch (e) {
    console.error("chat: LLM call failed:", e);
    const error = isRateLimited(e) ? "AI is busy (free tier limit) — try again in a minute." : "AI unavailable";
    return NextResponse.json({ error }, { status: isRateLimited(e) ? 429 : 500 });
  }
}
