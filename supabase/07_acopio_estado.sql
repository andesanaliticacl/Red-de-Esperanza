-- ============================================================
-- Red de Esperanza — Migración 07: Estado/región en centros de acopio
-- Ejecutar UNA vez DESPUÉS de schema.sql, en: SQL Editor → New query → Run
--
-- Permite filtrar los centros de acopio por país, estado/región y ciudad.
-- ============================================================

alter table centros_acopio add column if not exists estado text;

create index if not exists idx_acopio_estado on centros_acopio (estado);
