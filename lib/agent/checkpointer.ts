import pg from "pg";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";

// Agent conversations (memory and paused task approvals) live in Postgres, not
// in process memory: on Vercel the next request may run in a different process.
//
// They sit in their own schema because they contain the user's notes. Supabase's
// REST API only exposes the `public` schema, so nothing here is reachable with
// the anon key from the browser; only the server (DATABASE_URL) can read it.
export const AGENT_SCHEMA = "langgraph";

let saver: PostgresSaver | undefined;

/** One checkpointer per server process, over a small pool (transaction pooler, port 6543). */
export function getCheckpointer(): PostgresSaver {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set (Supabase → Connect → Transaction pooler)");
  }
  saver ??= new PostgresSaver(
    new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3 }),
    undefined,
    { schema: AGENT_SCHEMA }
  );
  return saver;
}
