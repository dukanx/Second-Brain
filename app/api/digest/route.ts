import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { createDigest } from "@/lib/digest";
import { isRateLimited } from "@/lib/llm";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data } = await supabase
    .from("digests")
    .select("id, content, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(10);

  return NextResponse.json({ digests: data ?? [] });
}

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const digest = await createDigest(supabase, user.id);
    if (!digest) return NextResponse.json({ error: "No captures yet" }, { status: 400 });
    return NextResponse.json({ ...digest, generatedAt: new Date().toISOString() });
  } catch (e) {
    console.error("digest: generation failed:", e);
    return isRateLimited(e)
      ? NextResponse.json({ error: "AI is busy (free tier limit) — try again in a minute." }, { status: 429 })
      : NextResponse.json({ error: "Digest generation failed" }, { status: 500 });
  }
}
