import type { SupabaseClient } from "@supabase/supabase-js";
import { generateObject } from "@/lib/llm";
import { CAPTURE_TYPES } from "@/lib/settings";

export type Category = { type: (typeof CAPTURE_TYPES)[number]; project: string; title: string };
export type ProjectInfo = { name: string; description?: string | null };
// A similar past capture and where the user filed it (few-shot example)
export type FiledExample = { title: string; project: string };

// The start of the text is enough to categorize, and keeps us far below
// Groq's 8K tokens/minute limit.
const CATEGORIZE_CHARS = 4000;

/**
 * Ask the LLM for a capture's type, project and title. Used by /api/capture
 * and by eval/categorize-eval.mts, so the eval measures exactly this code.
 */
export async function categorizeCapture(
  text: string,
  projects: ProjectInfo[],
  // Few-shot (experimental, see eval --few-shot): similar past captures with
  // their projects, so the model can copy the user's own filing habits.
  examples: FiledExample[] = []
): Promise<Category> {
  const projectNames = projects.map((p) => p.name);
  // Names alone ("FON", "Other") mean nothing to the model; descriptions say what goes where.
  const projectList = projects
    .map((p) => `  - ${p.name}${p.description ? `: ${p.description}` : ""}`)
    .join("\n");
  const examplesBlock = examples.length
    ? `\n- How I filed similar past captures (follow these habits when they fit):\n${examples
        .map((e) => `  - "${e.title}" → ${e.project}`)
        .join("\n")}`
    : "";

  const parsed = await generateObject<Category>({
    model: "fast",
    maxTokens: 600,
    schemaName: "capture_category",
    system: `You categorize entries in a personal knowledge base.
- type: "Learning" = something learned or explained (concepts, how-tos, notes from courses/videos); "Idea" = an idea or plan to maybe do; "Task" = a concrete to-do; "Link" = mainly a saved URL/resource; "Note" = personal facts, logs, status updates
- project: the project this belongs to:
${projectList}${examplesBlock}
- title: short and descriptive, max 60 chars, in the same language as the text`,
    messages: [{ role: "user", content: text.slice(0, CATEGORIZE_CHARS) }],
    // Enums make an invalid type or an unknown project impossible.
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["type", "project", "title"],
      properties: {
        type: { type: "string", enum: [...CAPTURE_TYPES] },
        project: { type: "string", enum: projectNames.length > 0 ? projectNames : ["Other"] },
        title: { type: "string" },
      },
    },
  });
  return { ...parsed, title: parsed.title.slice(0, 60) };
}

// kNN on the user's own captures: the most similar existing captures vote on
// the project. Eval 2026-10-16 (120 captures): kNN alone 75%, LLM with project
// descriptions 63%, this rule (kNN when >= 3 of 5 agree, else LLM) 73%. The
// rule is kept over plain kNN because kNN can never pick a project that has no
// captures yet (cold start), and the LLM can.
export const KNN_NEIGHBORS = 5;
export const KNN_MIN_AGREE = 3;

/**
 * The project most similar captures are filed under, or null when fewer than
 * KNN_MIN_AGREE of the KNN_NEIGHBORS nearest agree (let the LLM decide).
 * Reuses the capture's embedding — one database query, no extra Voyage call.
 */
export async function projectFromNeighbors(
  supabase: SupabaseClient,
  userId: string,
  embedding: number[] | string,
  allowedProjects: string[],
  excludeId: string | null = null
): Promise<string | null> {
  const { data, error } = await supabase.rpc("match_captures", {
    query_embedding: embedding,
    match_count: KNN_NEIGHBORS,
    p_user_id: userId,
    exclude_id: excludeId,
  });
  if (error || !data?.length) return null;

  const votes = new Map<string, number>();
  for (const m of data as { project: string }[]) votes.set(m.project, (votes.get(m.project) ?? 0) + 1);
  const [best, count] = [...votes.entries()].sort((a, b) => b[1] - a[1])[0];
  return count >= KNN_MIN_AGREE && allowedProjects.includes(best) ? best : null;
}
