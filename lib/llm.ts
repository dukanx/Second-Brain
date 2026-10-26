import Groq from "groq-sdk";

// Provider-agnostic LLM layer. Every AI feature calls generateText /
// generateObject instead of a provider SDK, so switching provider or model
// is a change in this file only.
//
// Provider: Groq free tier. Per model: 30 req/min, 1K req/day, 8K tokens/min,
// 200K tokens/day (https://console.groq.com/docs/rate-limits). The 8K tokens
// per minute limit is the tight one, so callers keep prompts compact.
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
type ResponseFormat = Parameters<typeof groq.chat.completions.create>[0]["response_format"];

export const MODELS = {
  // search synthesis, chat, digests
  smart: "openai/gpt-oss-120b",
  // capture categorization: simple task, and a separate rate-limit bucket
  fast: "openai/gpt-oss-20b",
} as const;

type Message = { role: "user" | "assistant"; content: string };

type GenerateOptions = {
  model?: keyof typeof MODELS;
  system: string;
  messages: Message[];
  // Includes the model's hidden reasoning tokens (gpt-oss reasons before answering)
  maxTokens: number;
  // How much the model reasons first: more = better answers, more tokens
  effort?: "low" | "medium" | "high";
};

async function callOnce(
  opts: GenerateOptions,
  responseFormat?: ResponseFormat
): Promise<string> {
  const completion = await groq.chat.completions.create({
    model: MODELS[opts.model ?? "smart"],
    messages: [{ role: "system", content: opts.system }, ...opts.messages],
    max_completion_tokens: opts.maxTokens,
    reasoning_effort: opts.effort ?? "low",
    include_reasoning: false,
    response_format: responseFormat,
  });

  const choice = completion.choices[0];
  if (choice?.finish_reason === "length") {
    throw new Error("LLM response truncated (max tokens reached)");
  }
  return choice?.message?.content ?? "";
}

// Known ways gpt-oss on Groq fails a request that was fine, each found by the
// categorization eval, with the reminder that fixes it on a second try:
//   json_validate_failed: output broke the strict schema (a capture listing six
//     links came back as an array of six objects) and Groq rejected it
//   tool_use_failed: the model tried to call a tool even though none was given
//     (gpt-oss was trained with built-in browsing/python tools)
const RETRY_HINTS: Record<string, string> = {
  json_validate_failed: "Return exactly one JSON object that matches the schema, never an array.",
  tool_use_failed: "You have no tools. Do not call any tool; answer directly.",
};

/** One call, plus one retry with a reminder when Groq rejects a known model slip. */
async function complete(opts: GenerateOptions, responseFormat?: ResponseFormat): Promise<string> {
  try {
    return await callOnce(opts, responseFormat);
  } catch (e) {
    const hint = RETRY_HINTS[rejectionCode(e) ?? ""];
    if (!hint) throw e;
    return callOnce({ ...opts, system: `${opts.system}\n\n${hint}` }, responseFormat);
  }
}

/**
 * True for a 400 caused by a model slip rather than by our request: invalid
 * tool call, unparsable output, schema mismatch. A fresh sample usually works,
 * so callers retry once. (Context-length errors are ours and are not retried.)
 */
export function isModelSlip(e: unknown): boolean {
  if (!(e instanceof Groq.APIError) || e.status !== 400) return false;
  const code = rejectionCode(e);
  if (code === "context_length_exceeded") return false;
  return (code !== undefined && code in RETRY_HINTS) || /parsing failed|tool call validation failed|could not be parsed/i.test(e.message);
}

/** The error code of a 400 from Groq (e.g. "json_validate_failed"), if any. */
function rejectionCode(e: unknown): string | undefined {
  if (!(e instanceof Groq.APIError) || e.status !== 400) return undefined;
  return (e.error as { error?: { code?: string } } | undefined)?.error?.code;
}

/** Free-form text answer (chat). */
export async function generateText(opts: GenerateOptions): Promise<string> {
  return complete(opts);
}

/**
 * Structured output: whatever comes back matches `schema`. Strict mode makes
 * the model follow the schema, and Groq validates the result server-side.
 * It is not a hard guarantee: Groq rejects a non-matching output with
 * `json_validate_failed` instead of returning it, which `complete` retries once.
 *
 * Strict schemas need every property listed in `required` (use
 * `["string", "null"]` for optional fields) and `additionalProperties: false`
 * on every object.
 */
export async function generateObject<T>(
  opts: GenerateOptions & { schemaName: string; schema: Record<string, unknown> }
): Promise<T> {
  const content = await complete(opts, {
    type: "json_schema",
    json_schema: { name: opts.schemaName, strict: true, schema: opts.schema },
  });
  return JSON.parse(content) as T;
}

/** True when the provider rejected the call for exceeding its rate limit. */
export function isRateLimited(e: unknown): boolean {
  return e instanceof Groq.APIError && e.status === 429;
}

// Prompt-injection classifier (Llama Prompt Guard 2 on Groq, free tier). Returns
// the probability (0..1) that the text tries to give the model instructions.
// Measured: a Mockito note scores 0.001, "Ignore all previous instructions…"
// scores 0.999. The model reads only ~512 tokens, and Serbian text with JSON and
// ids tokenizes heavily (1,500-char chunks overflowed it), so long text is
// checked in 600-char chunks and the highest score wins.
const GUARD_MODEL = "meta-llama/llama-prompt-guard-2-86m";
const GUARD_CHUNK_CHARS = 600;
export const INJECTION_THRESHOLD = 0.5;

export async function injectionScore(text: string): Promise<number> {
  const chunks: string[] = [];
  for (let i = 0; i < text.length && chunks.length < 12; i += GUARD_CHUNK_CHARS) {
    chunks.push(text.slice(i, i + GUARD_CHUNK_CHARS));
  }
  const scores = await Promise.all(
    chunks.map(async (chunk) => {
      const res = await groq.chat.completions.create({ model: GUARD_MODEL, messages: [{ role: "user", content: chunk }] });
      return Number(res.choices[0]?.message?.content) || 0;
    })
  );
  return Math.max(0, ...scores);
}
