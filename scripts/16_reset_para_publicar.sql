-- ============================================================
-- Red de Esperanza — Migración 16: RESET para publicar (a prueba de fallos)
-- Ejecutar en el SQL Editor de Supabase. Deja la app en CERO, conservando
-- solo al admin judicoro02@gmail.com.
--
-- Por qué la versión anterior podía "no hacer nada": si una sola tabla de la
-- lista no existía o fallaba, el script entero se cancelaba. Esta versión vacía
-- tabla por tabla y NO se detiene si alguna falla.
-- ============================================================

-- 1) Vaciar toda la actividad, tabla por tabla (sin abortar si alguna falla).
do $$
declare
  t text;
begin
  foreach t in array array[
    'eventos','mensajes','contactos_necesidad','necesidades',
    'desaparecidos','centros_acopio','chat_global'
  ] loop
    begin
      execute format('truncate table public.%I restart identity cascade', t);
      raise notice 'Vaciada: %', t;
    exception when others then
      raise notice 'Saltada % (%): no existe o no se pudo vaciar', t, sqlerrm;
    end;
  end loop;
end $$;

-- 2) Borrar TODOS los usuarios menos el admin (cascada borra sus perfiles).
delete from auth.users
where email is distinct from 'judicoro02@gmail.com';

-- 3) Limpiar cualquier perfil huérfano que haya quedado suelto.
delete from public.perfiles
where id not in (select id from auth.users);

-- 4) Verificación: todo en 0 y solo el admin.
select
  (select count(*) from public.necesidades) as necesidades,
  (select count(*) from public.mensajes)    as mensajes,
  (select count(*) from public.perfiles)    as perfiles,
  (select count(*) from auth.users)         as usuarios,
  (select email from auth.users limit 1)    as unico_usuario;
