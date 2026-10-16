import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { getSettings, parseSettings } from "@/lib/settings";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json({ settings: await getSettings(supabase, user.id) });
}

export async function PUT(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const patch = parseSettings(await request.json());
  if (!patch) return NextResponse.json({ error: "Invalid settings" }, { status: 400 });

  const { error } = await supabase
    .from("user_settings")
    .upsert({ user_id: user.id, ...patch, updated_at: new Date().toISOString() });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ settings: await getSettings(supabase, user.id) });
}
