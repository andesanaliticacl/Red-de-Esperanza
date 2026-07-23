-- ============================================================
-- Red de Esperanza — Migración 54: zona aislada también para líder de
-- voluntarios
-- Ejecutar UNA vez DESPUÉS de 53, en: SQL Editor → New query → Run
--
-- La migración 51 restringía crear 'zona_aislada' solo al admin. Ahora se
-- suma el rol 'lider_voluntarios' (el frontend ya muestra la opción a
-- ambos). El resto de tipos sigue abierto a cualquiera.
-- ============================================================

drop policy if exists "crear necesidad" on necesidades;
create policy "crear necesidad" on necesidades
  for insert
  with check (
    tipo::text <> 'zona_aislada'
    or public.tiene_rol(array['admin', 'lider_voluntarios']::rol_usuario[])
  );
