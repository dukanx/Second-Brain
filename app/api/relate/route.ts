import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { embedOne, captureEmbedInput, RELATE_COUNT, RELATE_THRESHOLD } from "@/lib/embeddings";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { captureId } = await request.json();

  const { data: target } = await supabase
    .from("captures")
    .select("id, title, text, embedding")
    .eq("id", captureId)
    .eq("user_id", user.id)
    .single();

  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Use the stored embedding; compute (and persist) it if missing (old capture).
  let embedding = target.embedding as number[] | null;
  try {
    if (!embedding) {
      embedding = await embedOne(captureEmbedInput(target.title, target.text), "document");
      await supabase
        .from("captures")
        .update({ embedding })
        .eq("id", captureId)
        .eq("user_id", user.id);
    }
  } catch (e) {
    console.error("relate: embedding unavailable:", e);
    return NextResponse.json({ relatedIds: [] });
  }

  const { data: matches, error } = await supabase.rpc("match_captures", {
    query_embedding: embedding,
    match_count: RELATE_COUNT,
    p_user_id: user.id,
    exclude_id: captureId,
  });

  if (error) {
    console.error("relate: match_captures failed:", error);
    return NextResponse.json({ relatedIds: [] });
  }

  const relatedIds: string[] = ((matches as { id: string; similarity: number }[]) ?? [])
    .filter((m) => m.similarity >= RELATE_THRESHOLD)
    .map((m) => m.id);

  if (relatedIds.length > 0) {
    await supabase
      .from("captures")
      .update({ related_ids: relatedIds })
      .eq("id", captureId)
      .eq("user_id", user.id);

    // Bidirectional: add this capture to each related capture's list too.
    for (const rid of relatedIds) {
      const { data: rel } = await supabase
        .from("captures")
        .select("related_ids")
        .eq("id", rid)
        .eq("user_id", user.id)
        .single();

      if (rel) {
        const existing: string[] = rel.related_ids ?? [];
        if (!existing.includes(captureId)) {
          await supabase
            .from("captures")
            .update({ related_ids: [...existing, captureId] })
            .eq("id", rid)
            .eq("user_id", user.id);
        }
      }
    }
  }

  return NextResponse.json({ relatedIds });
}
