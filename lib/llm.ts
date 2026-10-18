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

async function complete(
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

/** Free-form text answer (chat). */
export async function generateText(opts: GenerateOptions): Promise<string> {
  return complete(opts);
}

/**
 * Structured output: the response is guaranteed to match `schema`. Strict mode
 * uses constrained decoding, so the model cannot produce JSON that breaks the
 * schema, and there is no "parse and hope" step.
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
