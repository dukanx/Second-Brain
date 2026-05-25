import { createServiceClient } from "@/lib/supabase/server";
import Anthropic from "@anthropic-ai/sdk";
import webpush from "web-push";
import { NextResponse } from "next/server";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function generateAndSaveDigest(supabase: Awaited<ReturnType<typeof createServiceClient>>, user_id: string): Promise<string | null> {
  const { data: captures } = await supabase
    .from("captures")
    .select("id, title, text, type, project, created_at, last_reviewed_at")
    .eq("user_id", user_id)
    .order("created_at", { ascending: false })
    .limit(80);

  if (!captures?.length) return null;

  const catalogue = captures.map((c) => {
    const age = Math.floor((Date.now() - new Date(c.created_at).getTime()) / 86400000);
    const reviewed = c.last_reviewed_at
      ? `reviewed:${Math.floor((Date.now() - new Date(c.last_reviewed_at).getTime()) / 86400000)}d ago`
      : "never reviewed";
    return `${c.id}|${c.type}|${c.project}|${age}d|${reviewed}| ${c.title}: ${c.text.slice(0, 70)}`;
  }).join("\n");

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    system: `You are a personal knowledge analyst. Analyze the captures and return ONLY valid JSON:
- themes: string[] — 3-4 short phrases (max 4 words each)
- momentum: "high" | "medium" | "low"
- highlights: string[] — 3-4 most notable recent captures (max 10 words each)
- insight: string — one key observation (max 2 sentences)
- patterns: string — broader patterns (max 2 sentences)
- pendingTasks: {id:string,title:string}[] — up to 5 Task captures needing attention
- forgottenIdeas: {id:string,title:string}[] — up to 4 older never/rarely reviewed Idea/Learning captures
- suggestion: string — max 1 sentence, actionable

Return ONLY the JSON object.`,
    messages: [{ role: "user", content: catalogue }],
  });

  const content = message.content[0];
  if (content.type !== "text") return null;
  const raw = content.text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

  try {
    const parsed = JSON.parse(raw);
    await supabase.from("digests").insert({ user_id, content: { ...parsed, total: captures.length } });
    return parsed.insight ?? null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  webpush.setVapidDetails(
    process.env.VAPID_EMAIL!,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createServiceClient();
  const cutoff = new Date(Date.now() - 14 * 86400_000).toISOString();

  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("user_id, subscription");

  if (!subs?.length) return NextResponse.json({ sent: 0 });

  const isMonday = new Date().getDay() === 1;
  let sent = 0;

  for (const { user_id, subscription } of subs) {
    const notifications: { title: string; body: string; captureId?: string }[] = [];

    // Review reminder (daily) — fetch one random capture to preview
    const { data: dueCaps, count } = await supabase
      .from("captures")
      .select("id, title", { count: "exact" })
      .eq("user_id", user_id)
      .in("type", ["Learning", "Idea"])
      .or(`last_reviewed_at.is.null,last_reviewed_at.lt.${cutoff}`)
      .limit(10);

    if (count && dueCaps?.length) {
      const pick = dueCaps[Math.floor(Math.random() * dueCaps.length)];
      notifications.push({
        title: `Second Brain — ${count} due for review`,
        body: `"${pick.title}"`,
        captureId: pick.id,
      });
    }

    // Weekly digest (Mondays only) — auto-generate and save to digests table
    if (isMonday) {
      const insight = await generateAndSaveDigest(supabase, user_id);
      if (insight) {
        notifications.push({
          title: "Second Brain — weekly digest ready",
          body: insight,
        });
      }
    }

    for (const notif of notifications) {
      try {
        await webpush.sendNotification(subscription, JSON.stringify(notif));
        sent++;
      } catch {
        await supabase.from("push_subscriptions").delete()
          .eq("user_id", user_id)
          .eq("endpoint", subscription.endpoint);
        break;
      }
    }
  }

  return NextResponse.json({ sent });
}
