import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { createCapture, type CaptureInput } from "@/lib/createCapture";

// Capture from the web app: auth comes from the logged-in Supabase session
// cookie. The pipeline itself lives in lib/createCapture.ts.
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as CaptureInput | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const result = await createCapture(supabase, user.id, body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json({ capture: result.capture });
}
