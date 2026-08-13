-- ============================================================
-- Red de Esperanza — Migración 70: Tipo "maquinaria pesada"
-- Ejecutar UNA vez en: SQL Editor → New query → Run
--
-- El frontend ya tenía 'maquinaria' como tipo de necesidad (menú
-- "Reportar necesidad", mapa, íconos), pero nunca se agregó al enum
-- de la base — por eso fallaba con "invalid input value for enum
-- necesidad_tipo: maquinaria" al reportar o filtrar por ese tipo.
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
    alter type public.necesidad_tipo add value if not exists 'maquinaria';
    raise notice 'Enum necesidad_tipo actualizado: maquinaria agregado.';
  else
    raise notice 'No existe el enum necesidad_tipo: la columna tipo es texto libre; no hay nada que migrar.';
  end if;
end $$;
