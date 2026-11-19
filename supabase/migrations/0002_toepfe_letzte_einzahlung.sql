-- Merkt sich die Einzahlung im laufenden Monat, damit die Monatsrate nach
-- "+ eingezahlt" nicht fälschlich sinkt (der Monat zählt dann als bespart).
alter table public.toepfe
  add column letzte_einzahlung numeric(12, 2) check (letzte_einzahlung >= 0),
  add column letzte_einzahlung_monat date;
