-- Version 1.1: Szenarien ("Was wäre, wenn …")
-- Ein Szenario = zusätzliche Posten (posten.szenario_id) + Grundplan-Posten, die wegfallen (ohne_posten).
-- Der Grundplan sind alle Posten mit szenario_id = null.

create table public.szenarien (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  ohne_posten uuid[] not null default '{}',
  erstellt_am timestamptz not null default now()
);

create index szenarien_user_idx on public.szenarien (user_id);
alter table public.szenarien enable row level security;
create policy "eigene szenarien" on public.szenarien for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

alter table public.posten add column szenario_id uuid references public.szenarien (id) on delete cascade;
create index posten_szenario_idx on public.posten (szenario_id);
