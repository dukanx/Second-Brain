// One-off: create the LangGraph checkpoint tables in the `langgraph` schema.
//
//   npx tsx --env-file=.env.local scripts/setup-agent-db.mts
//
// Needs DATABASE_URL in .env.local (Supabase → Connect → Transaction pooler).
// Safe to run again: setup() only creates what is missing.

import { getCheckpointer, AGENT_SCHEMA } from "@/lib/agent/checkpointer";

const saver = getCheckpointer();
await saver.setup();
console.log(`checkpoint tables ready in schema "${AGENT_SCHEMA}"`);
await saver.end();
