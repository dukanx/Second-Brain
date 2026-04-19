import { createServiceClient } from "@/lib/supabase/server";
import webpush from "web-push";
import { NextResponse } from "next/server";

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

    // Review reminder (daily)
    const { count } = await supabase
      .from("captures")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user_id)
      .in("type", ["Learning", "Idea"])
      .or(`last_reviewed_at.is.null,last_reviewed_at.lt.${cutoff}`);

    if (count) {
      notifications.push({
        title: "Second Brain — review",
        body: `${count} capture${count > 1 ? "s" : ""} due for review`,
      });
    }

    // Weekly recap (Mondays only)
    if (isMonday) {
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - 7);
      const { count: weekCount } = await supabase
        .from("captures")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user_id)
        .gte("created_at", weekStart.toISOString().slice(0, 10));

      if (weekCount) {
        notifications.push({
          title: "Second Brain — weekly recap",
          body: `You captured ${weekCount} thing${weekCount > 1 ? "s" : ""} last week — open app to see your summary`,
        });
      }
    }

    for (const notif of notifications) {
      try {
        await webpush.sendNotification(subscription, JSON.stringify(notif));
        sent++;
      } catch {
        await supabase.from("push_subscriptions").delete().eq("user_id", user_id);
        break;
      }
    }
  }

  return NextResponse.json({ sent });
}
