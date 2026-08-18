-- ============================================================
-- Red de Esperanza — Migración 78: "Un profesional" en Yo tengo, y el
-- edificio dañado pero EN PIE
-- Ejecutar UNA vez DESPUÉS de la 77, en: SQL Editor → New query → Run
--
-- 1) OFERTA 'profesional': hasta ahora "Yo tengo" solo cubría cosas —agua,
--    comida, herramientas—, pero lo que más escasea tras un terremoto no es
--    material: es alguien que sepa. Un médico, un veterinario, un eléctrico
--    o un albañil que ofrezca sus horas es una oferta como cualquier otra, y
--    no tenía dónde publicarse.
--
-- 2) NECESIDAD 'edificio_inhabitable': hoy solo existe 'derrumbe', que es el
--    edificio que YA SE CAYÓ. Falta el que sigue en pie pero no se puede
--    habitar: con daño estructural, en riesgo de caer, o simplemente
--    inseguro. Son dos cosas distintas y se atienden distinto —a uno se va a
--    buscar gente entre escombros, del otro hay que SACARLA a tiempo—, así
--    que mezclarlas escondía justo la diferencia que importa.
--
--    Los reportes ya existentes NO se tocan: siguen como 'derrumbe', que es
--    lo que son.
-- ============================================================

do $$
begin
  if exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'oferta_tipo' and n.nspname = 'public'
  ) then
    alter type public.oferta_tipo add value if not exists 'profesional';
    raise notice 'Enum oferta_tipo actualizado: profesional agregado.';
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'necesidad_tipo' and n.nspname = 'public'
  ) then
    alter type public.necesidad_tipo
      add value if not exists 'edificio_inhabitable';
    raise notice 'Enum necesidad_tipo actualizado: edificio_inhabitable agregado.';
  else
    raise notice 'No existe el enum necesidad_tipo: la columna tipo es texto libre.';
  end if;
end $$;
