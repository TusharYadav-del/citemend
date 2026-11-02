begin;

create table if not exists public.cms_connections (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  domain text not null,
  platform text not null check (platform in ('shopify', 'wordpress', 'vercel')),
  shop_subdomain text,
  -- Application-encrypted token envelope (v1.<iv>.<auth-tag>.<ciphertext>), never plaintext.
  access_token text not null,
  created_at timestamptz not null default now(),
  constraint cms_connections_shopify_subdomain_check check (
    platform <> 'shopify' or shop_subdomain ~ '^[a-z0-9][a-z0-9-]*\.myshopify\.com$'
  ),
  constraint cms_connections_user_domain_platform_key unique (user_id, domain, platform)
);

create index if not exists cms_connections_user_id_idx
  on public.cms_connections (user_id);

alter table public.cms_connections enable row level security;
revoke all on table public.cms_connections from anon, authenticated;
grant all on table public.cms_connections to service_role;

comment on table public.cms_connections is
  'Server-managed CMS credentials. access_token contains an AES-256-GCM encrypted envelope; only trusted server code may read it.';
comment on column public.cms_connections.access_token is
  'AES-256-GCM encrypted token envelope using SHOPIFY_TOKEN_ENCRYPTION_KEY. Never store a raw Admin API token.';

commit;
