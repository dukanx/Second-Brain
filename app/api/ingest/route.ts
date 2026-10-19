import { createServiceClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createCapture, type CaptureInput } from "@/lib/createCapture";

// Capture from outside the browser (iOS Shortcuts, scripts, webhooks), where
// there is no Supabase session cookie. Auth is a static bearer token instead:
//
//   POST /api/ingest
//   Authorization: Bearer <INGEST_TOKEN>
//   Content-Type: application/json
//   { "text": "..." }            // same body as /api/capture
//
// The token maps to a single owner (INGEST_USER_ID). The service-role client
// bypasses RLS, which is why createCapture filters every query by user id.

function tokenMatches(header: string | null, expected: string): boolean {
  if (!header?.startsWith("Bearer ")) return false;
  const given = Buffer.from(header.slice("Bearer ".length).trim());
  const want = Buffer.from(expected);
  // Constant-time compare so the response time doesn't leak how many leading
  // characters of a guessed token were right. Lengths must match first.
  return given.length === want.length && timingSafeEqual(given, want);
}

export async function POST(request: Request) {
  const expected = process.env.INGEST_TOKEN;
  const userId = process.env.INGEST_USER_ID;

  // Fail closed: a missing or too-short token disables the route entirely
  // rather than accepting an empty "Bearer " header.
  if (!expected || expected.length < 32 || !userId) {
    console.error("ingest: INGEST_TOKEN (min 32 chars) or INGEST_USER_ID not configured");
    return NextResponse.json({ error: "Ingest is not configured" }, { status: 503 });
  }

  if (!tokenMatches(request.headers.get("authorization"), expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as CaptureInput | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const supabase = await createServiceClient();
  const result = await createCapture(supabase, userId, body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  // Short, human-readable reply: Shortcuts can show `title` in a notification.
  const { id, title, type, project } = result.capture as {
    id: string; title: string; type: string; project: string;
  };
  return NextResponse.json({ id, title, type, project }, { status: 201 });
}
