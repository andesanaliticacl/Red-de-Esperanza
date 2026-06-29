-- ============================================================
-- Red de Esperanza — Migración 25: email en el perfil (para el panel admin)
-- Ejecutar UNA vez en: SQL Editor → New query → Run
--
-- Guarda el correo en la tabla `perfiles` para que el administrador pueda
-- buscar/filtrar usuarios por correo (además de nombre y teléfono). El correo
-- solo lo ve el dueño del perfil o un admin (la RLS de perfiles ya lo limita).
-- ============================================================

alter table perfiles add column if not exists email text;

-- Rellenar el correo de los usuarios que ya existen (desde auth.users).
update perfiles p
set email = u.email
from auth.users u
where u.id = p.id and (p.email is null or p.email = '');
