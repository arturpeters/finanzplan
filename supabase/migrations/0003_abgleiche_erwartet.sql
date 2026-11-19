-- Speichert beim Monatsabgleich, welchen Stand der Plan erwartet hat,
-- damit "Plan vs. Ist" auch später noch nachvollziehbar ist.
alter table public.abgleiche add column erwartet numeric(12, 2);
