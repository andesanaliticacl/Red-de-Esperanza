-- ============================================================
-- Red de Esperanza — Migración 14: usuario ADMIN judicoro02@gmail.com
-- Ejecutar en el SQL Editor de Supabase.
--
-- IMPORTANTE: un usuario de Auth (con su contraseña) NO se puede crear bien
-- desde SQL. El flujo correcto es:
--   1) Registra judicoro02@gmail.com desde la app (pantalla de registro).
--   2) Ejecuta este script para volverlo admin.
--
-- El UPDATE directo de rol lo bloquea el trigger `proteger_rol` (nadie puede
-- auto-asignarse admin), por eso lo desactivamos un momento.
-- ============================================================

-- (Opcional) Borrar una cuenta anterior con ese mismo correo antes de recrearla.
-- Descomenta si quieres empezar de cero con ese email (borra también su perfil
-- y todo lo asociado por las llaves foráneas en cascada):
-- delete from auth.users where email = 'judicoro02@gmail.com';

-- Promover a admin (tras registrarlo en la app):
alter table public.perfiles disable trigger trg_proteger_rol;

update public.perfiles
set rol = 'admin'
where id = (select id from auth.users where email = 'judicoro02@gmail.com');

alter table public.perfiles enable trigger trg_proteger_rol;

-- Verificación: debe devolver una fila con rol = admin.
select p.id, u.email, p.nombre, p.rol
from public.perfiles p
join auth.users u on u.id = p.id
where u.email = 'judicoro02@gmail.com';
