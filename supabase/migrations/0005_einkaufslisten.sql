-- Einkaufslisten: geplante Käufe, verteilt über Monate (Modell "nach und nach kaufen").
-- Offene Positionen mit geplantem Monat gehen dort als einmalige Ausgabe in Plan und Prognose ein.

create table public.listen (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  erledigt boolean not null default false,
  erstellt_am timestamptz not null default now()
);

create table public.listen_positionen (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  liste_id uuid not null references public.listen (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  preis numeric(12, 2) not null check (preis >= 0),
  geplant_monat date,                 -- 1. des Monats; null = noch nicht eingeplant
  gekauft boolean not null default false,
  gekauft_preis numeric(12, 2) check (gekauft_preis >= 0), -- optional: was es wirklich gekostet hat
  erstellt_am timestamptz not null default now()
);

create index listen_user_idx on public.listen (user_id);
create index listen_positionen_user_idx on public.listen_positionen (user_id);
create index listen_positionen_liste_idx on public.listen_positionen (liste_id);

alter table public.listen enable row level security;
alter table public.listen_positionen enable row level security;

create policy "eigene listen" on public.listen for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "eigene listen_positionen" on public.listen_positionen for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
