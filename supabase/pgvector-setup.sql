-- ============================================================================
-- RAG setup for Second Brain — run this ONCE in the Supabase SQL editor.
-- (Dashboard → SQL Editor → New query → paste → Run.)
-- ============================================================================

-- 1. Enable the pgvector extension (provides the `vector` type + similarity ops).
create extension if not exists vector;

-- 2. Store a 1024-dim embedding per capture (voyage-3.5-lite default dimension).
alter table captures add column if not exists embedding vector(1024);

-- 3. Index for fast approximate nearest-neighbour search (cosine distance).
create index if not exists captures_embedding_idx
  on captures using hnsw (embedding vector_cosine_ops);

-- 4. Similarity search function used by /api/search and /api/relate.
--    Returns the `match_count` captures closest to `query_embedding` for a user,
--    optionally excluding one capture (used when finding a capture's relatives).
create or replace function match_captures(
  query_embedding vector(1024),
  match_count int,
  p_user_id uuid,
  exclude_id uuid default null
)
returns table (
  id uuid,
  title text,
  text text,
  type text,
  project text,
  created_at timestamptz,
  similarity float
)
language sql
stable
as $$
  select
    c.id,
    c.title,
    c.text,
    c.type,
    c.project,
    c.created_at,
    1 - (c.embedding <=> query_embedding) as similarity
  from captures c
  where c.user_id = p_user_id
    and c.embedding is not null
    and (exclude_id is null or c.id <> exclude_id)
  order by c.embedding <=> query_embedding
  limit match_count;
$$;
