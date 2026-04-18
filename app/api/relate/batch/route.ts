import { createClient } from "@/lib/supabase/server";
import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: captures } = await supabase
    .from("captures")
    .select("id, title, text, type, project")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (!captures || captures.length < 2)
    return NextResponse.json({ pairs: 0 });

  // Use numeric indices in prompt → tiny output (e.g. [[0,3],[1,5]])
  const catalogue = captures
    .map((c, i) => `${i}: [${c.type}/${c.project}] ${c.title} — ${c.text.slice(0, 80)}`)
    .join("\n");

  let indexPairs: [number, number][] = [];

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: `You are a knowledge graph builder. Given numbered captures, return ONLY a JSON array of index pairs [[i,j],...] for captures that are semantically related (share topics, themes, projects, or ideas). Be generous. Return ONLY the JSON array.`,
      messages: [{ role: "user", content: catalogue }],
    });

    const content = message.content[0];
    if (content.type === "text") {
      const raw = content.text
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();
      indexPairs = JSON.parse(raw);
      if (!Array.isArray(indexPairs)) indexPairs = [];
    }
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }

  // Map indices → UUIDs
  const uuidPairs: [string, string][] = indexPairs
    .filter(([a, b]) => captures[a] && captures[b])
    .map(([a, b]) => [captures[a].id, captures[b].id]);

  // Build adjacency map
  const adj: Record<string, Set<string>> = {};
  for (const [a, b] of uuidPairs) {
    if (!adj[a]) adj[a] = new Set();
    if (!adj[b]) adj[b] = new Set();
    adj[a].add(b);
    adj[b].add(a);
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

  return NextResponse.json({ pairs: uuidPairs.length, nodes: Object.keys(adj).length });
}
