import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { subscription } = await request.json();
  const endpoint: string = subscription.endpoint;

  await supabase
    .from("push_subscriptions")
    .upsert({ user_id: user.id, subscription, endpoint }, { onConflict: "user_id,endpoint" });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { endpoint } = await request.json().catch(() => ({}));
  const query = supabase.from("push_subscriptions").delete().eq("user_id", user.id);
  if (endpoint) query.eq("endpoint", endpoint);
  await query;
  return NextResponse.json({ ok: true });
}
