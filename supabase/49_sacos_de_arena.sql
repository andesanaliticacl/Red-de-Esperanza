-- ============================================================
-- Red de Esperanza — Migración 49: Tipo "sacos de arena"
-- Ejecutar UNA vez en: SQL Editor → New query → Run
--
-- Necesidad para temporales/inundaciones: pedir o coordinar sacos de
-- arena para contener el agua. Se muestra en el mapa con marcador propio
-- (🧱) y aparece en el menú "Reportar necesidad".
--
-- Es segura en cualquier base: detecta si `necesidades.tipo` usa el
-- enum `necesidad_tipo` (como en schema.sql) o es texto libre.
-- ============================================================

do $$
begin
  if exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'necesidad_tipo' and n.nspname = 'public'
  ) then
    alter type public.necesidad_tipo add value if not exists 'sacos_arena';
    raise notice 'Enum necesidad_tipo actualizado: sacos_arena agregado.';
  else
    raise notice 'No existe el enum necesidad_tipo: la columna tipo es texto libre; no hay nada que migrar.';
  end if;
end $$;
