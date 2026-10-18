import type { SupabaseClient } from "@supabase/supabase-js";
import { generateObject } from "@/lib/llm";

export type DigestContent = {
  themes: string[];
  momentum: "high" | "medium" | "low";
  highlights: string[];
  insight: string;
  patterns: string;
  pendingTasks: { id: string; title: string }[];
  forgottenIdeas: { id: string; title: string }[];
  suggestion: string;
  total: number;
};

// 60 recent captures, ~60 chars each: about 3K tokens, so the call fits in
// Groq's 8K tokens/minute limit together with the answer.
const DIGEST_CAPTURES = 60;

/**
 * Generate a digest of the user's recent captures, save it to `digests`, and
 * return it (null when there are no captures). Used by the in-app "generate"
 * button and the weekly cron, so both produce the same digest.
 */
export async function createDigest(supabase: SupabaseClient, userId: string): Promise<DigestContent | null> {
  const { data: captures } = await supabase
    .from("captures")
    .select("id, title, text, type, project, created_at, last_reviewed_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(DIGEST_CAPTURES);

  if (!captures?.length) return null;

  // Captures are numbered instead of listing UUIDs: a UUID costs ~20 tokens,
  // an index 1–2. The model answers with indices and we map them back.
  const days = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  const catalogue = captures
    .map((c, i) => {
      const reviewed = c.last_reviewed_at ? `reviewed ${days(c.last_reviewed_at)}d ago` : "never reviewed";
      return `${i}|${c.type}|${c.project}|${days(c.created_at)}d old|${reviewed}| ${c.title}: ${c.text.slice(0, 60)}`;
    })
    .join("\n");

  const parsed = await generateObject<
    Omit<DigestContent, "pendingTasks" | "forgottenIdeas" | "total"> & {
      pendingTasks: number[];
      forgottenIdeas: number[];
    }
  >({
    maxTokens: 2000,
    schemaName: "digest",
    system: `You are a personal knowledge analyst. Each line is: index|type|project|age|review status| title: text. Keep all strings short, in the language most captures are written in.
- themes: 3-4 short phrases (max 4 words each)
- momentum: based on recency, quantity, and variety
- highlights: 3-4 most notable recent captures or patterns (max 10 words each)
- insight: one key observation about current focus (max 2 sentences)
- patterns: broader patterns across all captures (max 2 sentences)
- pendingTasks: indices of up to 5 Task captures needing attention
- forgottenIdeas: indices of up to 4 older Idea/Learning captures worth revisiting
- suggestion: max 1 sentence, actionable next step`,
    messages: [{ role: "user", content: catalogue }],
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["themes", "momentum", "highlights", "insight", "patterns", "pendingTasks", "forgottenIdeas", "suggestion"],
      properties: {
        themes: { type: "array", items: { type: "string" } },
        momentum: { type: "string", enum: ["high", "medium", "low"] },
        highlights: { type: "array", items: { type: "string" } },
        insight: { type: "string" },
        patterns: { type: "string" },
        pendingTasks: { type: "array", items: { type: "integer" } },
        forgottenIdeas: { type: "array", items: { type: "integer" } },
        suggestion: { type: "string" },
      },
    },
  });

  // Map indices back to captures, dropping any index that is out of range
  const toRefs = (indices: number[], max: number) =>
    [...new Set(indices)]
      .filter((i) => captures[i])
      .slice(0, max)
      .map((i) => ({ id: captures[i].id, title: captures[i].title }));

  const digest: DigestContent = {
    ...parsed,
    pendingTasks: toRefs(parsed.pendingTasks, 5),
    forgottenIdeas: toRefs(parsed.forgottenIdeas, 4),
    total: captures.length,
  };

  await supabase.from("digests").insert({ user_id: userId, content: digest });
  return digest;
}
