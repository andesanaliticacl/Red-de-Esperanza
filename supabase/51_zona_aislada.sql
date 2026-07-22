-- ============================================================
-- Red de Esperanza — Migración 51: Tipo "zona aislada" (solo admin)
-- Ejecutar UNA vez DESPUÉS de 50, en: SQL Editor → New query → Run
--
-- Una "zona aislada" es un área incomunicada / de difícil acceso que el
-- ADMIN marca para verla de un vistazo en el mapa. Se comporta como
-- 'zona_sin_atender' (área con radio), pero SOLO el admin puede crearla.
--
-- Es segura en cualquier base: detecta si `necesidades.tipo` usa el enum
-- `necesidad_tipo` (como en schema.sql) o es texto libre. La restricción
-- por rol usa comparación de TEXTO ('zona_aislada'), no el literal del
-- enum, así que no choca con la regla de "no usar un valor de enum recién
-- agregado en la misma transacción".
-- ============================================================

do $$
begin
  if exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'necesidad_tipo' and n.nspname = 'public'
  ) then
    alter type public.necesidad_tipo add value if not exists 'zona_aislada';
    raise notice 'Enum necesidad_tipo actualizado: zona_aislada agregado.';
  else
    raise notice 'No existe el enum necesidad_tipo: la columna tipo es texto libre; no hay nada que migrar.';
  end if;
end $$;

-- Crear necesidad: sigue abierto a cualquiera para todos los tipos, PERO
-- 'zona_aislada' solo la puede insertar un admin (la RLS lo bloquea aunque
-- alguien intente saltarse el frontend).
drop policy if exists "crear necesidad" on necesidades;
create policy "crear necesidad" on necesidades
  for insert
  with check (
    tipo::text <> 'zona_aislada'
    or public.tiene_rol(array['admin']::rol_usuario[])
  );
