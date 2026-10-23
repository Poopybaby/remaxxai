-- Phase 3: vibe search.
-- One row per project holds what search reads: a plain-language style description, the text that
-- keyword search matches (title, description, tags, labels, style), and an embedding of that text
-- for similarity search. Rows are written by the server's indexer (lib/search/indexer.ts).

create extension if not exists vector;

create table project_search (
  project_id uuid primary key references projects (id) on delete cascade,
  -- Which version the description was written from; a new version means re-describe.
  version_id uuid references project_versions (id) on delete set null,
  style_description text not null default '' check (char_length(style_description) <= 1000),
  -- seed: written by hand for a starter template; ai: written by a model from the code;
  -- auto: built from code hints alone (no AI key, or the model call failed).
  style_source text not null default 'auto' check (style_source in ('seed', 'ai', 'auto')),
  search_text text not null default '' check (char_length(search_text) <= 4000),
  search_tsv tsvector generated always as (to_tsvector('english', search_text)) stored,
  embedding vector(1536),
  embedding_model text,
  embedded_text_hash text,
  updated_at timestamptz not null default now()
);

create index project_search_tsv_idx on project_search using gin (search_tsv);
create index project_search_embedding_idx on project_search
  using hnsw (embedding vector_cosine_ops);

create trigger project_search_set_updated_at
  before update on project_search
  for each row execute function remaxx_set_updated_at();

alter table project_search enable row level security;
revoke all on table project_search from anon, authenticated;
