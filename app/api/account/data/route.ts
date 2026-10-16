import { createClient, createServiceClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { DELETE_CONFIRMATION } from "@/lib/settings";

// Tables holding the user's content. Projects, settings and push subscriptions
// are configuration and stay, so the app keeps working after a wipe.
const CONTENT_TABLES = ["captures", "digests", "summaries", "query_log"] as const;

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { confirm } = await request.json().catch(() => ({}));
  if (confirm !== DELETE_CONFIRMATION) {
    return NextResponse.json({ error: "Confirmation phrase does not match" }, { status: 400 });
  }

  // Service client so the delete doesn't depend on each table having a delete
  // policy. It bypasses RLS, so every query MUST filter by the user's id.
  const admin = await createServiceClient();
  const deleted: Record<string, number> = {};
  for (const table of CONTENT_TABLES) {
    const { count, error } = await admin
      .from(table)
      .delete({ count: "exact" })
      .eq("user_id", user.id);
    if (error) return NextResponse.json({ error: `${table}: ${error.message}`, deleted }, { status: 500 });
    deleted[table] = count ?? 0;
  }

  return NextResponse.json({ deleted });
}
