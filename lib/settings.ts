import type { SupabaseClient } from "@supabase/supabase-js";

// Phrase the user must type to wipe their data (checked by DELETE /api/account/data).
export const DELETE_CONFIRMATION = "delete all my captures";

export const CAPTURE_TYPES = ["Idea", "Link", "Task", "Learning", "Note"] as const;
export const REVIEW_SLOTS = ["off", "morning", "afternoon", "both"] as const;

export type UserSettings = {
  digest_enabled: boolean;
  digest_day: number; // 0 = Sunday … 6 = Saturday (UTC)
  review_reminders: (typeof REVIEW_SLOTS)[number];
  task_reminders: boolean;
  default_type: (typeof CAPTURE_TYPES)[number] | null;
  default_project: string | null;
};

// Matches the column defaults in supabase/settings-and-query-log.sql, so a user
// without a settings row behaves exactly like before settings existed.
export const DEFAULT_SETTINGS: UserSettings = {
  digest_enabled: true,
  digest_day: 1,
  review_reminders: "both",
  task_reminders: true,
  default_type: null,
  default_project: null,
};

const SETTINGS_COLUMNS =
  "digest_enabled, digest_day, review_reminders, task_reminders, default_type, default_project";

export async function getSettings(supabase: SupabaseClient, userId: string): Promise<UserSettings> {
  const { data } = await supabase
    .from("user_settings")
    .select(SETTINGS_COLUMNS)
    .eq("user_id", userId)
    .maybeSingle();
  return { ...DEFAULT_SETTINGS, ...(data ?? {}) };
}

/** Keep only known fields with valid values; returns null if anything is invalid. */
export function parseSettings(body: unknown): Partial<UserSettings> | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const out: Partial<UserSettings> = {};

  if ("digest_enabled" in b) {
    if (typeof b.digest_enabled !== "boolean") return null;
    out.digest_enabled = b.digest_enabled;
  }
  if ("digest_day" in b) {
    if (!Number.isInteger(b.digest_day) || (b.digest_day as number) < 0 || (b.digest_day as number) > 6) return null;
    out.digest_day = b.digest_day as number;
  }
  if ("review_reminders" in b) {
    if (!REVIEW_SLOTS.includes(b.review_reminders as UserSettings["review_reminders"])) return null;
    out.review_reminders = b.review_reminders as UserSettings["review_reminders"];
  }
  if ("task_reminders" in b) {
    if (typeof b.task_reminders !== "boolean") return null;
    out.task_reminders = b.task_reminders;
  }
  if ("default_type" in b) {
    if (b.default_type !== null && !CAPTURE_TYPES.includes(b.default_type as UserSettings["default_type"] & string)) return null;
    out.default_type = b.default_type as UserSettings["default_type"];
  }
  if ("default_project" in b) {
    if (b.default_project !== null && (typeof b.default_project !== "string" || b.default_project.length > 100)) return null;
    out.default_project = (b.default_project as string | null) || null;
  }
  return out;
}
