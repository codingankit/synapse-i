# Synapse

Synapse is a **brand governance memory layer**. You ingest a "Brand Bible" (brand guidelines document), and Synapse turns it into a searchable set of rule atoms that any content-generation workflow can check against — either through a web console or as MCP tools an AI agent can call directly.

It's a Turborepo monorepo with three packages:

- **`apps/web`** — Next.js 16 console for uploading a Brand Bible, watching ingestion, running ad-hoc audits, and inspecting memory status.
- **`apps/mcp`** — A Hono-based MCP server (`StreamableHTTPTransport`) exposing the same capabilities as tools an agent (e.g. Claude) can call mid-generation.
- **`packages/core`** — Shared logic: parsing, extraction, embedding, retrieval, and the LangGraph audit/context workflows. Both apps depend on `@synapse/core`.

## How it works

1. **Ingest** — A brand document (PDF) is uploaded and parsed into markdown via LlamaCloud (`parseBrandBible`). A Gemini extraction pass turns the markdown into structured rule atoms (`category`, `rule`, `context`, `is_negative`). Each atom is embedded with Voyage AI and written to Supabase (`ingestBrandBible`).
2. **Retrieve** — Queries hit Supabase through a hybrid search RPC (`match_hybrid_synapse`) that fuses vector similarity and full-text search via Reciprocal Rank Fusion, then reranks the top results with Voyage's reranking model.
3. **Audit** — `runAuditCore` (a two-node LangGraph: `retrieve` → `audit`) checks a piece of draft content against retrieved rule atoms and returns a structured `AuditReport` (status, score, violations, feedback).
4. **Context** — `getContext` (a two-node LangGraph: `retrieve` → `synthesize`) takes a prompt _before_ generation and returns a `systemDirective` string — tone/voice, mandatory rules, forbidden elements, execution guidance — meant to be injected as a system prompt so the generated content stays on-brand from the start.

Both workflows degrade gracefully: embedding failures, RPC errors, empty memory, or LLM provider errors all produce a typed fallback result instead of throwing.

## Project layout

```
synapse/
├── apps/
│   ├── web/    Next.js console — ingest, audit, and manage brand memory
│   └── mcp/    Hono MCP server — synapse-get-context, synapse-audit-content tools
├── packages/
│   └── core/   Parsing, ingestion, retrieval, audit/context LangGraph workflows
```

### `packages/core`

- `services/parser.ts` — uploads a file to LlamaCloud, polls an agentic parse job, returns markdown.
- `services/ingest.ts` — markdown → Gemini rule extraction → Voyage embeddings → batched Supabase insert (with rollback on partial failure).
- `services/audit.ts` — LangGraph workflow: hybrid retrieval + rerank, then Gemini audits content against retrieved atoms.
- `services/context.ts` — LangGraph workflow: hybrid retrieval + rerank, then Gemini synthesizes a brand directive for use as a system prompt.
- `services/memory.ts` — memory status (row count) and full memory clear.
- `lib/models.ts` — model wiring: Voyage (`voyage-4-lite` embeddings, `rerank-2.5-lite` reranking) and Gemini (`gemini-3.5-flash` for extraction/audit), all overridable via env vars.
- `lib/supabase.ts` — Supabase client, configured by `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_TABLE`.

### `apps/mcp`

Registers two MCP tools backed by `@synapse/core`:

- **`synapse-get-context`** — fetch the brand directive for a prompt before generating content.
- **`synapse-audit-content`** — audit already-drafted content against brand memory and return a formatted violation report.

Served over Streamable HTTP at `http://localhost:7000/mcp`.

### `apps/web`

A single-page console (`SYNAPSE — Brand Governance Console`) with:

- **IngestionCard** — upload a Brand Bible, see memory status (rule count), clear memory (with confirmation modal).
- **ExecutionTestbench** — paste draft content and trigger an audit.
- **AuditFeedback** — displays the audit score, status, and per-rule violations with suggested fixes.

Built with Next.js 16, React 19, Tailwind v4, and Radix/shadcn primitives.

## Database setup

Synapse stores rule atoms in Postgres via Supabase, using `pgvector` for embeddings and full-text search for keyword matching. Run the following in the Supabase SQL editor before first use:

```sql
---------------------------------------------------------
-- 0. Extensions
---------------------------------------------------------
create extension if not exists vector;
create extension if not exists pg_trgm;


---------------------------------------------------------
-- 1. Table: synapse_memory
---------------------------------------------------------
create table if not exists synapse_memory (
  id          uuid primary key default gen_random_uuid(),
  content     text not null,
  embedding   vector(1024) not null,          -- Voyage AI voyage-4 dimension
  metadata    jsonb not null default '{}'::jsonb,
  fts_content tsvector generated always as (to_tsvector('english', content)) stored,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Keep updated_at fresh on writes
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_synapse_memory_updated_at on synapse_memory;
create trigger trg_synapse_memory_updated_at
  before update on synapse_memory
  for each row
  execute function set_updated_at();


---------------------------------------------------------
-- 2. Indexes
---------------------------------------------------------

-- HNSW index for fast approximate nearest-neighbor vector search.
-- vector_cosine_ops matches Voyage AI's recommended cosine distance.
create index if not exists idx_synapse_memory_embedding_hnsw
  on synapse_memory
  using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);

-- GIN index for full-text search (recommended over GiST for this workload)
create index if not exists idx_synapse_memory_fts_gin
  on synapse_memory
  using gin (fts_content);

-- Optional: index on metadata for fast filtering by agent_id/session_id/workspace_scope
create index if not exists idx_synapse_memory_metadata_gin
  on synapse_memory
  using gin (metadata jsonb_path_ops);


---------------------------------------------------------
-- 3. RPC: match_synapse — pure semantic vector search
---------------------------------------------------------
create or replace function match_synapse (
  query_embedding vector(1024),
  match_count     int default 10,
  filter          jsonb default '{}'::jsonb
)
returns table (
  id         uuid,
  content    text,
  metadata   jsonb,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    sm.id,
    sm.content,
    sm.metadata,
    1 - (sm.embedding <=> query_embedding) as similarity
  from synapse_memory sm
  where (filter = '{}'::jsonb or sm.metadata @> filter)
  order by sm.embedding <=> query_embedding
  limit match_count;
end;
$$;


---------------------------------------------------------
-- 4. RPC: match_text_synapse — pure keyword full-text search
---------------------------------------------------------
create or replace function match_text_synapse (
  query_text  text,
  match_count int default 10,
  filter      jsonb default '{}'::jsonb
)
returns table (
  id       uuid,
  content  text,
  metadata jsonb,
  rank     float
)
language plpgsql
as $$
begin
  return query
  select
    sm.id,
    sm.content,
    sm.metadata,
    ts_rank_cd(sm.fts_content, websearch_to_tsquery('english', query_text))::double precision as rank
  from synapse_memory sm
  where sm.fts_content @@ websearch_to_tsquery('english', query_text)
    and (filter = '{}'::jsonb or sm.metadata @> filter)
  order by rank desc
  limit match_count;
end;
$$;


---------------------------------------------------------
-- 5. RPC: match_hybrid_synapse — RRF hybrid search
---------------------------------------------------------
create or replace function match_hybrid_synapse (
  query_text      text,
  query_embedding vector(1024),
  match_count     int default 10,
  filter          jsonb default '{}'::jsonb,
  rrf_k           int default 60
)
returns table (id uuid, content text, metadata jsonb, hybrid_score float)
language plpgsql
stable
as $$
begin
  return query
  with q as (
    select nullif(
      replace(plainto_tsquery('english', query_text)::text, ' & ', ' | '),
      ''
    )::tsquery as tsq
  ),
  semantic as (
    select
      sm.id,
      row_number() over (order by sm.embedding <=> query_embedding) as rank
    from synapse_memory sm
    where (filter = '{}'::jsonb or sm.metadata @> filter)
    order by sm.embedding <=> query_embedding
    limit match_count * 2
  ),
  keyword as (
    select
      sm.id,
      row_number() over (order by ts_rank_cd(sm.fts_content, q.tsq) desc) as rank
    from synapse_memory sm, q
    where q.tsq is not null
      and sm.fts_content @@ q.tsq
      and (filter = '{}'::jsonb or sm.metadata @> filter)
    order by ts_rank_cd(sm.fts_content, q.tsq) desc
    limit match_count * 2
  ),
  fused as (
    select
      coalesce(s.id, k.id) as id,
      (coalesce(1.0 / (rrf_k + s.rank), 0.0) + coalesce(1.0 / (rrf_k + k.rank), 0.0))::double precision as score
    from semantic s
    full outer join keyword k on s.id = k.id
  )
  select sm.id, sm.content, sm.metadata, fused.score as hybrid_score
  from fused
  join synapse_memory sm on sm.id = fused.id
  order by fused.score desc
  limit match_count;
end;
$$;
```

## Environment variables

Both `apps/web` and `apps/mcp` need a `.env` (see `.env.example` in each) with:

| Variable                                            | Description                                                            |
| --------------------------------------------------- | ---------------------------------------------------------------------- |
| `SUPABASE_URL`                                      | Supabase project URL                                                   |
| `SUPABASE_SERVICE_ROLE_KEY`                         | Supabase service role key (bypasses RLS)                               |
| `SUPABASE_TABLE`                                    | Vector memory table name (`synapse_memory`)                            |
| `VOYAGE_API_KEY`                                    | Voyage AI API key (embeddings + reranking)                             |
| `GOOGLE_GENERATIVE_AI_API_KEY`                      | Gemini API key (rule extraction + audit/context synthesis)             |
| `LLAMA_CLOUD_API_KEY`                               | LlamaCloud API key (document parsing)                                  |
| `GEMINI_EXTRACTION_MODEL` / `GEMINI_AUDIT_MODEL`    | Optional model overrides (default `gemini-3.5-flash`)                  |
| `VOYAGE_EMBEDDING_MODEL` / `VOYAGE_RERANKING_MODEL` | Optional model overrides (default `voyage-4-lite` / `rerank-2.5-lite`) |
| `PORT`                                              | `apps/web` defaults to `3000`, `apps/mcp` defaults to `7000`           |

## Getting started

```bash
pnpm install

# copy and fill in env files
cp apps/web/.env.example apps/web/.env
cp apps/mcp/.env.example apps/mcp/.env

# run the SQL setup above in your Supabase project, then:
pnpm dev       # runs both apps/web and apps/mcp via Turborepo
```

- Web console: http://localhost:3000
- MCP server: http://localhost:7000/mcp
