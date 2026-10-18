import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { embedOne, rerank } from "@/lib/embeddings";
import { logQuery, type RetrievalFallback } from "@/lib/queryLog";
import { generateObject, isRateLimited } from "@/lib/llm";

// How many captures to retrieve and feed into the synthesis. Keeping this small
// is the whole point of RAG: cost stays flat no matter how many captures exist.
const RETRIEVE_COUNT = 12;
// Vector search casts a wider net, then the reranker picks the best RETRIEVE_COUNT.
const RERANK_CANDIDATES = 20;
// Per-capture text sent to the LLM. 12 × 1000 chars ≈ 4K tokens, which leaves
// room for the answer inside Groq's 8K tokens/minute limit.
const CONTEXT_CHARS = 1000;

type RetrievedCapture = {
  id: string;
  title: string;
  text: string;
  type: string;
  project: string;
  created_at: string;
};

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { query } = await request.json();
  if (!query?.trim()) return NextResponse.json({ error: "Empty query" }, { status: 400 });

  // RAG retrieval: embed the query and pull only the most semantically similar
  // captures via pgvector, instead of sending the entire knowledge base.
  let captures: RetrievedCapture[] = [];
  let fallback: RetrievalFallback = null;
  try {
    const queryEmbedding = await embedOne(query, "query");
    const { data: matches, error: matchError } = await supabase.rpc("match_captures", {
      query_embedding: queryEmbedding,
      match_count: RERANK_CANDIDATES,
      p_user_id: user.id,
    });
    if (matchError) throw matchError;
    const candidates = (matches as RetrievedCapture[]) ?? [];
    try {
      captures = await rerank(query, candidates, RETRIEVE_COUNT);
    } catch (e) {
      // Reranker down or rate limited: keep the vector order.
      console.error("search: rerank failed, using vector order:", e);
      fallback = "rerank";
      captures = candidates.slice(0, RETRIEVE_COUNT);
    }
  } catch (e) {
    console.error("vector retrieval failed, falling back to recent captures:", e);
    fallback = "vector";
    // Fallback (e.g. before backfill, or Voyage outage): use recent captures so
    // search still works, just without semantic ranking.
    const { data: recent } = await supabase
      .from("captures")
      .select("id, title, text, type, project, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(RETRIEVE_COUNT);
    captures = recent ?? [];
  }

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
