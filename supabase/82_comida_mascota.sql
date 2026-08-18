-- ============================================================
-- Red de Esperanza — Migración 82: "comida para mascota" en Yo tengo
-- Ejecutar UNA vez DESPUÉS de la 81, en: SQL Editor → New query → Run
--
-- La comida de animales no es la misma que la de personas y no sirve para
-- lo mismo: quien tiene un saco de alimento para perro no puede ofrecerlo
-- como "Comida" sin confundir a una familia que busca qué comer, y quien
-- busca para su gato no tiene cómo encontrarlo entre las ofertas de comida.
--
-- La ESPECIE (perro, gato, otro) no lleva columna propia: se escribe en la
-- descripción, que ya existe y es libre. Una columna más para un dato que
-- solo sirve de aclaración no paga su costo.
-- ============================================================

do $$
begin
  if exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'oferta_tipo' and n.nspname = 'public'
  ) then
    alter type public.oferta_tipo add value if not exists 'comida_mascota';
    raise notice 'Enum oferta_tipo actualizado: comida_mascota agregado.';
  end if;
end $$;
