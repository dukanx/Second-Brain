import { createServiceClient } from "@/lib/supabase/server";
import Anthropic from "@anthropic-ai/sdk";
import webpush from "web-push";
import { NextResponse } from "next/server";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function getWeekStart(): string {
  const d = new Date();
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return d.toISOString().slice(0, 10);
}

async function generateWeeklySummary(supabase: Awaited<ReturnType<typeof createServiceClient>>, user_id: string): Promise<string | null> {
  const weekStart = getWeekStart();
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const { data: captures } = await supabase
    .from("captures")
    .select("title, text, type, project")
    .eq("user_id", user_id)
    .gte("created_at", new Date(new Date(weekStart).getTime() - 7 * 86400_000).toISOString().slice(0, 10))
    .lt("created_at", weekStart)
    .order("created_at", { ascending: true });

  if (!captures?.length) return null;

  const catalogue = captures
    .map((c) => `[${c.type}][${c.project}] ${c.title}: ${c.text.slice(0, 80)}`)
    .join("\n");

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: `You are a personal knowledge analyst. Analyze this week's captures and return ONLY valid JSON:
- highlights: string[] — 3-4 most notable things captured (max 10 words each)
- themes: string[] — 2-3 main themes (max 4 words each)
- insight: string — one key observation about this week (max 2 sentences)
- momentum: "high" | "medium" | "low" — based on quantity and variety of captures

Return ONLY the JSON object. Keep all strings short.`,
    messages: [{ role: "user", content: `${captures.length} captures last week:\n${catalogue}` }],
  });

  const content = message.content[0];
  if (content.type !== "text") return null;
  const raw = content.text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

  try {
    const parsed = JSON.parse(raw);
    // Save to summaries table (previous week)
    const prevWeekStart = new Date(new Date(weekStart).getTime() - 7 * 86400_000).toISOString().slice(0, 10);
    await supabase
      .from("summaries")
      .upsert({ user_id, week_start: prevWeekStart, content: parsed }, { onConflict: "user_id,week_start" });
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
  const cutoff = new Date(Date.now() - 7 * 86400_000).toISOString();

  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("user_id, subscription");

  if (!subs?.length) return NextResponse.json({ sent: 0 });

  const isMonday = new Date().getDay() === 1;
  let sent = 0;

  for (const { user_id, subscription } of subs) {
    const notifications: { title: string; body: string }[] = [];

    // Review reminder (daily) — fetch one random capture to preview
    const { data: dueCaps, count } = await supabase
      .from("captures")
      .select("title", { count: "exact" })
      .eq("user_id", user_id)
      .in("type", ["Learning", "Idea"])
      .or(`last_reviewed_at.is.null,last_reviewed_at.lt.${cutoff}`)
      .limit(10);

    if (count && dueCaps?.length) {
      const preview = dueCaps[Math.floor(Math.random() * dueCaps.length)].title;
      notifications.push({
        title: `Second Brain — ${count} due for review`,
        body: `"${preview}"`,
      });
    }

    // Weekly recap (Mondays only) — auto-generate summary and use insight
    if (isMonday) {
      const { count: weekCount } = await supabase
        .from("captures")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user_id)
        .gte("created_at", new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10));

      if (weekCount) {
        const insight = await generateWeeklySummary(supabase, user_id);
        notifications.push({
          title: `Second Brain — ${weekCount} captures last week`,
          body: insight ?? "Open app to see your weekly summary",
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
