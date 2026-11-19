-- Grundschema der Finanz-Planungs-App (Version 1, ohne Szenarien).
-- Jede Tabelle gehört genau einem Nutzer; Row Level Security sorgt dafür,
-- dass jeder eingeloggte Nutzer nur seine eigenen Zeilen sieht und ändert.

-- Hilfsfunktion: geaendert_am bei jedem Update setzen
create or replace function public.setze_geaendert_am()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.geaendert_am = now();
  return new;
end;
$$;

-- Konten (inkl. Unterkonten über oberkonto_id)
create table public.konten (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  bank text check (char_length(bank) <= 80),
  art text not null default 'giro'
    check (art in ('giro', 'tagesgeld', 'depot', 'kredit', 'bar', 'sonstiges')),
  oberkonto_id uuid references public.konten (id) on delete set null,
  startsaldo numeric(12, 2) not null default 0,
  startsaldo_datum date not null default current_date,
  rendite_pa numeric(5, 2),                -- nur für Depot: angenommene Rendite in % pro Jahr
  aktiv boolean not null default true,     -- false = zählt nirgends mehr mit
  ausgeblendet boolean not null default false, -- true = zählt mit, wird nur nicht angezeigt
  sortierung integer not null default 0,
  erstellt_am timestamptz not null default now(),
  geaendert_am timestamptz not null default now(),
  check (oberkonto_id is null or oberkonto_id <> id)
);

-- Feste Einnahmen, Ausgaben und Umbuchungen
create table public.posten (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  typ text not null check (typ in ('einnahme', 'ausgabe', 'umbuchung')),
  betrag numeric(12, 2) not null check (betrag >= 0),
  rhythmus text not null default 'monatlich'
    check (rhythmus in ('monatlich', 'vierteljaehrlich', 'halbjaehrlich', 'jaehrlich', 'einmalig')),
  faellig_monat smallint check (faellig_monat between 1 and 12), -- Zahlmonat bei nicht-monatlichen Posten
  gueltig_ab date not null default date_trunc('month', current_date)::date,
  gueltig_bis date,
  von_konto_id uuid references public.konten (id) on delete set null,
  auf_konto_id uuid references public.konten (id) on delete set null,
  kategorie text check (char_length(kategorie) <= 40),
  notiz text check (char_length(notiz) <= 500),
  aktiv boolean not null default true,
  erstellt_am timestamptz not null default now(),
  geaendert_am timestamptz not null default now(),
  check (gueltig_bis is null or gueltig_bis >= gueltig_ab)
);

-- Töpfe (Sparziele für geplante Einzelkosten)
create table public.toepfe (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  zielbetrag numeric(12, 2) not null check (zielbetrag >= 0),
  zielmonat date not null,
  angespart numeric(12, 2) not null default 0 check (angespart >= 0),
  konto_id uuid references public.konten (id) on delete set null,
  aktiv boolean not null default true,
  erledigt boolean not null default false,
  erstellt_am timestamptz not null default now(),
  geaendert_am timestamptz not null default now()
);

-- Monatlicher Abgleich: echter Kontostand pro Konto und Datum
create table public.abgleiche (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  konto_id uuid not null references public.konten (id) on delete cascade,
  datum date not null default current_date,
  saldo numeric(12, 2) not null,
  erstellt_am timestamptz not null default now(),
  unique (konto_id, datum)
);

-- Indizes für Fremdschlüssel und Nutzerfilter
create index konten_user_idx on public.konten (user_id);
create index konten_oberkonto_idx on public.konten (oberkonto_id);
create index posten_user_idx on public.posten (user_id);
create index posten_von_idx on public.posten (von_konto_id);
create index posten_auf_idx on public.posten (auf_konto_id);
create index toepfe_user_idx on public.toepfe (user_id);
create index toepfe_konto_idx on public.toepfe (konto_id);
create index abgleiche_user_idx on public.abgleiche (user_id);
create index abgleiche_konto_idx on public.abgleiche (konto_id);

-- Trigger für geaendert_am
create trigger konten_geaendert before update on public.konten
  for each row execute function public.setze_geaendert_am();
create trigger posten_geaendert before update on public.posten
  for each row execute function public.setze_geaendert_am();
create trigger toepfe_geaendert before update on public.toepfe
  for each row execute function public.setze_geaendert_am();

-- Row Level Security: nur eigene Zeilen
alter table public.konten enable row level security;
alter table public.posten enable row level security;
alter table public.toepfe enable row level security;
alter table public.abgleiche enable row level security;

create policy "eigene konten" on public.konten for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "eigene posten" on public.posten for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "eigene toepfe" on public.toepfe for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "eigene abgleiche" on public.abgleiche for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Wach-Tabelle: wird einmal pro Woche von GitHub Actions gelesen,
-- damit das kostenlose Projekt nicht pausiert. Enthält keine Nutzerdaten.
create table public.wach (
  id smallint primary key default 1 check (id = 1),
  notiz text not null default 'keepalive'
);
insert into public.wach (id) values (1);
alter table public.wach enable row level security;
create policy "wach lesbar" on public.wach for select to anon, authenticated using (true);
