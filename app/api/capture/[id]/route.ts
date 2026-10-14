import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { embedOne, captureEmbedInput } from "@/lib/embeddings";
import { CAPTURE_COLUMNS } from "@/lib/captures";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { text, title, type, project } = await request.json();

  const patch: Record<string, unknown> = { text, title, type, project };

  // Content changed → refresh the embedding so search/relation stay accurate.
  try {
    patch.embedding = await embedOne(captureEmbedInput(title ?? "", text ?? ""), "document");
  } catch (e) {
    console.error("embedding failed on capture update:", e);
  }

  const { data, error } = await supabase
    .from("captures")
    .update(patch)
    .eq("id", id)
    .eq("user_id", user.id)
    .select(CAPTURE_COLUMNS)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ capture: data });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();
  const allowed = ["starred", "last_reviewed_at", "due_date", "priority", "text"];
  const patch = Object.fromEntries(Object.entries(body).filter(([k]) => allowed.includes(k)));

  // If the text is edited via PATCH, keep the embedding in sync too. The title
  // isn't patchable here, so read it: every embedding must be built the same
  // way (title + text) or similarity scores stop being comparable.
  if (typeof patch.text === "string") {
    try {
      const { data: current } = await supabase
        .from("captures")
        .select("title")
        .eq("id", id)
        .eq("user_id", user.id)
        .single();
      patch.embedding = await embedOne(captureEmbedInput(current?.title ?? "", patch.text), "document");
    } catch (e) {
      console.error("embedding failed on capture patch:", e);
    }
  }

  const { data, error } = await supabase
    .from("captures")
    .update(patch)
    .eq("id", id)
    .eq("user_id", user.id)
    .select(CAPTURE_COLUMNS)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ capture: data });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const { error } = await supabase
    .from("captures")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
