import { createClient } from "@/lib/supabase/server";
import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { captureId } = await request.json();

  const { data: target } = await supabase
    .from("captures")
    .select("*")
    .eq("id", captureId)
    .eq("user_id", user.id)
    .single();

  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: others } = await supabase
    .from("captures")
    .select("id, title, text, type, project")
    .eq("user_id", user.id)
    .neq("id", captureId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (!others || others.length === 0) return NextResponse.json({ ok: true });

  const catalogue = others
    .map((c) => `ID:${c.id} [${c.type}/${c.project}] ${c.title}: ${c.text.slice(0, 120)}`)
    .join("\n");

  let relatedIds: string[] = [];
  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 256,
      system: `You find semantic connections between knowledge captures. Given a new capture and a list of existing captures, return ONLY a JSON array of UUIDs that are semantically related to the new capture. Return [] if none are related. Return ONLY the JSON array.`,
      messages: [
        {
          role: "user",
          content: `NEW CAPTURE:\n[${target.type}/${target.project}] ${target.title}: ${target.text}\n\nEXISTING CAPTURES:\n${catalogue}`,
        },
      ],
    });

    const content = message.content[0];
    if (content.type === "text") {
      const raw = content.text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
      relatedIds = JSON.parse(raw);
      if (!Array.isArray(relatedIds)) relatedIds = [];
    }
  } catch {
    // AI unavailable — skip relation detection
  }

  if (relatedIds.length > 0) {
    await supabase
      .from("captures")
      .update({ related_ids: relatedIds })
      .eq("id", captureId)
      .eq("user_id", user.id);

    // Bidirectional: update related captures too
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
