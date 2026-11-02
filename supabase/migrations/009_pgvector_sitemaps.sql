begin;

create schema if not exists extensions;
create extension if not exists vector with schema extensions;
set local search_path = public, extensions;

create table public.sitemap_pages (
  id uuid primary key default gen_random_uuid(),
  domain text not null check (domain = lower(domain) and domain <> ''),
  url text not null,
  page_title text not null,
  embedding vector(768) not null,
  embedding_model text not null default 'gemini-embedding-001',
  updated_at timestamptz not null default now(),
  unique (domain, url)
);

alter table public.sitemap_pages enable row level security;
revoke all on public.sitemap_pages from anon, authenticated;
grant all on public.sitemap_pages to service_role;

-- Each domain has at most 200 selected pages. Exact search avoids approximate
-- index recall loss when filtering by domain; the unique index handles that filter.
create or replace function public.match_sitemap_url(
  query_embedding vector(768),
  target_domain text,
  match_threshold double precision,
  match_count integer,
  query_model text default 'gemini-embedding-001'
)
returns table (url text, similarity double precision)
language plpgsql stable security invoker
set search_path = public, extensions, pg_temp
as $$
begin
  if query_embedding is null or vector_dims(query_embedding) <> 768
     or vector_norm(query_embedding) = 0 then
    raise exception 'Expected a nonzero 768-dimensional query embedding';
  end if;
  if target_domain is null or trim(target_domain) = ''
     or match_threshold is null or not (match_threshold between -1 and 1)
     or match_count is null or match_count < 1 then
    raise exception 'Invalid sitemap match parameters';
  end if;
  return query
    select p.url, (1 - (p.embedding <=> query_embedding))::double precision
    from public.sitemap_pages p
    where p.domain = lower(trim(target_domain))
      and p.embedding_model = query_model
      and 1 - (p.embedding <=> query_embedding) >= match_threshold
    order by p.embedding <=> query_embedding, p.url
    limit least(match_count, 20);
end;
$$;

revoke all on function public.match_sitemap_url(vector, text, double precision, integer, text) from public, anon, authenticated;
grant execute on function public.match_sitemap_url(vector, text, double precision, integer, text) to service_role;
comment on table public.sitemap_pages is
  'Server-only sitemap URL embeddings. Only live-verified matches may become redirect suggestions.';

notify pgrst, 'reload schema';
commit;
