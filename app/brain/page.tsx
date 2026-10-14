import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import BrainClient from "@/components/BrainClient";
import { CAPTURE_COLUMNS } from "@/lib/captures";

export default async function BrainPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: captures } = await supabase
    .from("captures")
    .select(CAPTURE_COLUMNS)
    .order("created_at", { ascending: false });

  return <BrainClient user={user} initialCaptures={captures ?? []} />;
}
