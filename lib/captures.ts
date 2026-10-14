// Columns returned to the client. Deliberately excludes the large `embedding`
// vector (1024 floats per capture) so it never bloats client state, page HTML
// or JSON exports. Use this instead of select("*") on the captures table.
export const CAPTURE_COLUMNS =
  "id, user_id, text, title, type, project, related_ids, created_at, starred, last_reviewed_at, due_date, priority";
