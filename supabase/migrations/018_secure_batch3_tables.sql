begin;
alter table public.rescued_ai_visits enable row level security;
alter table public.workspace_integrations enable row level security;
revoke all on public.rescued_ai_visits, public.workspace_integrations from public, anon, authenticated;
grant all on public.rescued_ai_visits, public.workspace_integrations to service_role;
commit;
