import type { SupabaseClient } from "@supabase/supabase-js";

// Which stage of retrieval failed, if any:
//   "rerank" → reranker failed, vector order was used
//   "vector" → embedding/vector search failed, recent captures were used
export type RetrievalFallback = "rerank" | "vector" | null;

/**
 * Record a search/chat question and what retrieval returned (table query_log).
 * Makes silent fallbacks visible and collects real questions for the eval.
 * Never throws: a logging failure must not break search or chat.
 */
export async function logQuery(
  supabase: SupabaseClient,
  entry: {
    userId: string;
    source: "search" | "chat";
    query: string;
    retrievedIds: string[];
    fallback: RetrievalFallback;
  }
): Promise<void> {
  const { error } = await supabase.from("query_log").insert({
    user_id: entry.userId,
    source: entry.source,
    query: entry.query.slice(0, 2000),
    retrieved_ids: entry.retrievedIds,
    fallback: entry.fallback,
  });
  if (error) console.error("query_log insert failed:", error.message);
}
