-- Links bei Einkaufslisten-Positionen (nur https)
alter table public.listen_positionen
  add column link text check (link is null or (link ~ '^https://' and char_length(link) <= 500));

-- Kündigungsfrist bei Posten: bis wann man spätestens kündigen muss
alter table public.posten add column kuendbar_bis date;

-- Einstellungen, die zwischen Handy und Laptop abgeglichen werden (eine Zeile pro Nutzer)
create table public.einstellungen (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  frei_modus text not null default 'ausgeben' check (frei_modus in ('ausgeben', 'haelfte', 'sparen')),
  notgroschen_monate smallint not null default 3 check (notgroschen_monate between 0 and 24),
  notgroschen_lebenshaltung numeric(12, 2) not null default 0 check (notgroschen_lebenshaltung >= 0),
  notgroschen_konten uuid[], -- null = automatisch alle Tagesgeld-/Sparkonten
  geaendert_am timestamptz not null default now()
);

alter table public.einstellungen enable row level security;
create policy "eigene einstellungen" on public.einstellungen for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
