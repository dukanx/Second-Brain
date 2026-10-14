// Voyage AI embeddings (Anthropic's recommended embeddings provider).
// Docs: https://docs.voyageai.com/reference/embeddings-api
const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings";

// voyage-3.5-lite: high quality, very low cost, 1024-dim output by default.
// Keep this in sync with the vector(1024) column + match_captures() in SQL.
export const EMBEDDING_MODEL = "voyage-3.5-lite";
export const EMBEDDING_DIM = 1024;

// Stay well within the model's context window even for very long captures.
const MAX_CHARS = 8000;

// Relate (graph links): keep up to RELATE_COUNT nearest captures whose cosine
// similarity is at least RELATE_THRESHOLD. Measured on 491 candidate pairs
// labelled related/unrelated (2026-10-14): 0.71 gave the best F1 (precision
// 70%, recall 82%); below 0.70 most pairs were noise. Capture-to-capture
// scores run much higher than query-to-capture ones, so don't reuse this
// threshold for search.
export const RELATE_COUNT = 6;
export const RELATE_THRESHOLD = 0.71;

type InputType = "document" | "query";

/** Embed one or more texts. `document` for stored captures, `query` for searches. */
export async function embed(input: string[], inputType: InputType): Promise<number[][]> {
  if (input.length === 0) return [];
  const res = await fetch(VOYAGE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: input.map((t) => t.slice(0, MAX_CHARS)),
      input_type: inputType,
    }),
  });

  if (!res.ok) {
    throw new Error(`Voyage embeddings failed: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as { data: { embedding: number[]; index: number }[] };
  // Sort by index to guarantee alignment with the input order.
  return data.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

/** Embed a single text and return its vector. */
export async function embedOne(text: string, inputType: InputType): Promise<number[]> {
  return (await embed([text], inputType))[0];
}

/** Build the text we embed for a capture (title carries a lot of signal). */
export function captureEmbedInput(title: string, text: string): string {
  return `${title}\n\n${text}`.trim();
}
