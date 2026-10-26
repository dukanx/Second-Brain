import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { logQuery } from "@/lib/queryLog";
import { retrieveCaptures } from "@/lib/retrieval";
import { generateObject, isRateLimited } from "@/lib/llm";

// How many captures to retrieve and feed into the synthesis. Keeping this small
// is the whole point of RAG: cost stays flat no matter how many captures exist.
const RETRIEVE_COUNT = 12;
// Vector search casts a wider net, then the reranker picks the best RETRIEVE_COUNT.
const RERANK_CANDIDATES = 20;
// Per-capture text sent to the LLM. 12 × 1000 chars ≈ 4K tokens, which leaves
// room for the answer inside Groq's 8K tokens/minute limit.
const CONTEXT_CHARS = 1000;

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { query } = await request.json();
  if (!query?.trim()) return NextResponse.json({ error: "Empty query" }, { status: 400 });

  // RAG retrieval: only the most relevant captures go to the LLM, never the whole base.
  const { captures, fallback } = await retrieveCaptures(supabase, user.id, query, {
    candidates: RERANK_CANDIDATES,
    keep: RETRIEVE_COUNT,
    label: "search",
  });

  await logQuery(supabase, {
    userId: user.id,
    source: "search",
    query,
    retrievedIds: captures.map((c) => c.id),
    fallback,
  });

  if (captures.length === 0) {
    return NextResponse.json({
      synthesis: "No captures found. Start by adding some knowledge captures.",
      relevantCaptures: [],
      followUpQuestions: [],
    });
  }

  const catalogue = captures
    .map((c) => `[${c.id}] [${c.type}/${c.project}] ${c.title}: ${c.text.slice(0, CONTEXT_CHARS)}`)
    .join("\n\n");

  let synthesis = "";
  let relevantIds: string[] = [];
  let followUpQuestions: string[] = [];

  try {
    const parsed = await generateObject<{
      synthesis: string;
      relevantIds: string[];
      followUpQuestions: string[];
    }>({
      maxTokens: 2500,
      schemaName: "search_answer",
      system: `You are a personal knowledge assistant. Given the user's knowledge captures and a query, synthesize a thoughtful answer drawing from their captures. Answer in the language of the query.
- synthesis: 2-4 paragraphs synthesizing insights from the captures relevant to the query
- relevantIds: ids of the most relevant captures (max 8), most relevant first
- followUpQuestions: 3 follow-up questions to deepen understanding`,
      messages: [{ role: "user", content: `QUERY: ${query}\n\nKNOWLEDGE BASE:\n${catalogue}` }],
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["synthesis", "relevantIds", "followUpQuestions"],
        properties: {
          synthesis: { type: "string" },
          // Only ids we actually sent can come back, so no hallucinated ids.
          relevantIds: { type: "array", items: { type: "string", enum: captures.map((c) => c.id) } },
          followUpQuestions: { type: "array", items: { type: "string" } },
        },
      },
    });
    synthesis = parsed.synthesis;
    relevantIds = parsed.relevantIds.slice(0, 8);
    followUpQuestions = parsed.followUpQuestions.slice(0, 3);
  } catch (e) {
    console.error("search: synthesis failed:", e);
    synthesis = isRateLimited(e)
      ? "AI search is busy (free tier limit) — try again in a minute."
      : `AI search error: ${e instanceof Error ? e.message : String(e)}`;
  }

  const relevantCaptures = captures.filter((c) => relevantIds.includes(c.id));

  return NextResponse.json({ synthesis, relevantCaptures, followUpQuestions });
}
