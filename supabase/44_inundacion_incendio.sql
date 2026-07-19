-- ============================================================
-- Red de Esperanza — Migración 44: Tipos "inundación" e "incendio"
-- Ejecutar UNA vez en: SQL Editor → New query → Run
--
-- La red se vuelve multi-emergencia: agrega los tipos de necesidad
-- 'inundacion' (temporales de lluvia, p. ej. Chile) e 'incendio'.
-- Se muestran en el mapa con marcador propio (🌊 / 🔥) y aparecen
-- en el menú "Reportar necesidad".
--
-- Es segura en cualquier base: detecta si `necesidades.tipo` usa el
-- enum `necesidad_tipo` (como en schema.sql) o es texto libre.
--  - Con enum: agrega los dos valores (como se hizo con 'derrumbe').
--  - Con texto: no hay nada que hacer y solo lo avisa.
-- ============================================================

do $$
begin
  if exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'necesidad_tipo' and n.nspname = 'public'
  ) then
    alter type public.necesidad_tipo add value if not exists 'inundacion';
    alter type public.necesidad_tipo add value if not exists 'incendio';
    raise notice 'Enum necesidad_tipo actualizado: inundacion e incendio agregados.';
  else
    raise notice 'No existe el enum necesidad_tipo: la columna tipo es texto libre; no hay nada que migrar.';
  end if;
end $$;
