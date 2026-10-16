-- ============================================================================
-- Settings + query log for Second Brain — run this ONCE in the Supabase SQL editor.
-- (Dashboard → SQL Editor → New query → paste → Run.)
-- ============================================================================

-- 1. Per-user settings. One row per user; a missing row means "all defaults"
--    (lib/settings.ts), so existing users need no migration.
create table if not exists user_settings (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  digest_enabled   boolean  not null default true,
  -- 0 = Sunday … 6 = Saturday (same as JS Date.getDay(), UTC)
  digest_day       smallint not null default 1 check (digest_day between 0 and 6),
  -- which of the two daily cron runs sends review reminders (09:00 / 14:00 UTC)
  review_reminders text     not null default 'both'
                   check (review_reminders in ('off', 'morning', 'afternoon', 'both')),
  task_reminders   boolean  not null default true,
  -- used when AI categorization is unavailable; null = old behaviour
  default_type     text     check (default_type in ('Idea', 'Link', 'Task', 'Learning', 'Note')),
  default_project  text,
  updated_at       timestamptz not null default now()
);

alter table user_settings enable row level security;

drop policy if exists "users manage own settings" on user_settings;
create policy "users manage own settings" on user_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 2. Query log: every search/chat question, what retrieval returned, and which
--    fallback (if any) kicked in. Two uses:
--    - observability: silent fallbacks (Voyage down, rerank rate-limited) become visible
--    - eval: real questions to build a harder golden dataset from
create table if not exists query_log (
  id             bigint generated always as identity primary key,
  user_id        uuid not null references auth.users(id) on delete cascade,
  source         text not null check (source in ('search', 'chat')),
  query          text not null,
  retrieved_ids  uuid[] not null default '{}',
  -- null = full pipeline worked; 'rerank' = vector order used; 'vector' = recent captures used
  fallback       text check (fallback in ('rerank', 'vector')),
  created_at     timestamptz not null default now()
);

create index if not exists query_log_user_created_idx on query_log (user_id, created_at desc);

alter table query_log enable row level security;

drop policy if exists "users manage own query log" on query_log;
create policy "users manage own query log" on query_log
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
