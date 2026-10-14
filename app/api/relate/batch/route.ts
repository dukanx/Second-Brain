import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { RELATE_COUNT, RELATE_THRESHOLD } from "@/lib/embeddings";

// Rebuild the whole relation graph from stored embeddings: for every capture,
// take its nearest neighbours above the threshold and link them both ways.
// Same rule as /api/relate, so single and batch relate never disagree.
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: captures } = await supabase
    .from("captures")
    .select("id, embedding")
    .eq("user_id", user.id)
    .not("embedding", "is", null);

  if (!captures || captures.length < 2)
    return NextResponse.json({ pairs: 0 });

  // Build adjacency map (undirected: A→B implies B→A)
  const adj: Record<string, Set<string>> = {};
  const link = (a: string, b: string) => {
    (adj[a] ??= new Set()).add(b);
    (adj[b] ??= new Set()).add(a);
  };

  for (const c of captures) {
    const { data: matches, error } = await supabase.rpc("match_captures", {
      query_embedding: c.embedding,
      match_count: RELATE_COUNT,
      p_user_id: user.id,
      exclude_id: c.id,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    for (const m of (matches as { id: string; similarity: number }[]) ?? []) {
      if (m.similarity >= RELATE_THRESHOLD) link(c.id, m.id);
    }
  }

  // Clear all existing related_ids
  await supabase
    .from("captures")
    .update({ related_ids: [] })
    .eq("user_id", user.id);

  // Write new adjacency
  for (const [id, related] of Object.entries(adj)) {
    await supabase
      .from("captures")
      .update({ related_ids: [...related] })
      .eq("id", id)
      .eq("user_id", user.id);
  }

  const pairs = Object.values(adj).reduce((sum, s) => sum + s.size, 0) / 2;
  return NextResponse.json({ pairs, nodes: Object.keys(adj).length });
}
