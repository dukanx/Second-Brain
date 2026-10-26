import type { SupabaseClient } from "@supabase/supabase-js";
import { embedOne, rerank } from "@/lib/embeddings";
import type { RetrievalFallback } from "@/lib/queryLog";

export type RetrievedCapture = {
  id: string;
  title: string;
  text: string;
  type: string;
  project: string;
  created_at: string;
};

/**
 * RAG retrieval shared by search, chat and the agent's semantic_search tool:
 * embed the query → pgvector nearest `candidates` → Voyage rerank → best `keep`.
 *
 * Each stage has a fallback, and `fallback` reports which one was used:
 *   "rerank" → reranker failed, vector order is kept
 *   "vector" → embedding/vector search failed, most recent captures are used
 * Retrieval eval: vector top-k hit@1 83% → with rerank 100%.
 */
export async function retrieveCaptures(
  supabase: SupabaseClient,
  userId: string,
  query: string,
  { candidates, keep, excludeId = null, label }: { candidates: number; keep: number; excludeId?: string | null; label: string }
): Promise<{ captures: RetrievedCapture[]; fallback: RetrievalFallback }> {
  try {
    const queryEmbedding = await embedOne(query, "query");
    const { data: matches, error } = await supabase.rpc("match_captures", {
      query_embedding: queryEmbedding,
      match_count: candidates,
      p_user_id: userId,
      exclude_id: excludeId,
    });
    if (error) throw error;
    const found = (matches as RetrievedCapture[]) ?? [];
    try {
      return { captures: await rerank(query, found, keep), fallback: null };
    } catch (e) {
      console.error(`${label}: rerank failed, using vector order:`, e);
      return { captures: found.slice(0, keep), fallback: "rerank" };
    }
  } catch (e) {
    console.error(`${label}: vector retrieval failed, falling back to recent captures:`, e);
    const { data: recent } = await supabase
      .from("captures")
      .select("id, title, text, type, project, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(keep);
    return { captures: recent ?? [], fallback: "vector" };
  }
}
