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

  // Tomorrow's date (notify day before due)
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().slice(0, 10);

  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("user_id, subscription");

  if (!subs?.length) return NextResponse.json({ sent: 0 });

  let sent = 0;

  for (const { user_id, subscription } of subs) {
    const { data: tasks } = await supabase
      .from("captures")
      .select("id, title, priority")
      .eq("user_id", user_id)
      .eq("type", "Task")
      .eq("due_date", tomorrowStr);

    if (!tasks?.length) continue;

    const highPriority = tasks.filter((t) => t.priority === "high");
    const taskList = tasks.map((t) => t.title).join(", ");
    const title = highPriority.length
      ? `⚠ Task due tomorrow: ${highPriority[0].title}`
      : `Second Brain — ${tasks.length} task${tasks.length > 1 ? "s" : ""} due tomorrow`;
    const body = tasks.length > 1 ? taskList.slice(0, 100) : tasks[0].title;

    try {
      await webpush.sendNotification(subscription, JSON.stringify({ title, body, captureId: tasks[0].id, notifType: "task" }));
      sent++;
    } catch {
      await supabase.from("push_subscriptions").delete()
        .eq("user_id", user_id)
        .eq("endpoint", subscription.endpoint);
    }
  }

  return NextResponse.json({ sent });
}
