-- ============================================================
-- Red de Esperanza — Migración 16: RESET para publicar (empezar de cero)
-- Ejecutar en el SQL Editor de Supabase.
--
-- ⚠️ DESTRUCTIVO: borra TODOS los datos de prueba (necesidades, mensajes,
-- acopios, desaparecidos, chat, eventos) y TODOS los usuarios EXCEPTO el admin
-- judicoro02@gmail.com. Deja la app vacía, lista para que la gente la use.
-- ============================================================

-- 1) Vaciar toda la actividad (cascade limpia lo que dependa de estas tablas).
truncate table
  eventos,
  mensajes,
  contactos_necesidad,
  necesidades,
  desaparecidos,
  centros_acopio,
  chat_global
restart identity cascade;

-- 2) Borrar todos los usuarios MENOS el admin.
--    Al borrar de auth.users, su perfil se borra en cascada.
delete from auth.users
where email <> 'judicoro02@gmail.com';

-- 3) Verificación: deben quedar 0 necesidades y solo el admin.
select
  (select count(*) from necesidades) as necesidades,
  (select count(*) from mensajes)    as mensajes,
  (select count(*) from perfiles)    as perfiles,
  (select email from auth.users limit 1) as unico_usuario;
