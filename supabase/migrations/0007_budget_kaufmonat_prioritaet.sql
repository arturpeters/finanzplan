-- Kaufmonat: beim Abhaken gemerkt, damit gekaufte Positionen in ihrem Kaufmonat als Ausgabe zählen
alter table public.listen_positionen add column gekauft_monat date;

-- Muss / Wunsch pro Position
alter table public.listen_positionen
  add column prioritaet text not null default 'muss' check (prioritaet in ('muss', 'wunsch'));

-- Optionales Budget pro Liste
alter table public.listen add column budget numeric(12, 2) check (budget is null or budget >= 0);
