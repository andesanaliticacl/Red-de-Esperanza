-- ============================================================
-- Red de Esperanza — Migración 58: país en `desaparecidos`
-- Ejecutar UNA vez DESPUÉS de la 57, en: SQL Editor → New query → Run
--
-- Hasta ahora TODA la tabla `desaparecidos` es de una sola fuente: el
-- scraper del terremoto de Venezuela (2026). No tenía columna de país
-- porque nunca hizo falta distinguir. Como la red ya cubre más países (y
-- futuras catástrofes tendrán sus propios desaparecidos), se agrega la
-- columna y se etiquetan los registros existentes.
-- ============================================================

alter table public.desaparecidos add column if not exists pais text;

update public.desaparecidos set pais = 'Venezuela' where pais is null;

create index if not exists idx_desaparecidos_pais on public.desaparecidos (pais);
