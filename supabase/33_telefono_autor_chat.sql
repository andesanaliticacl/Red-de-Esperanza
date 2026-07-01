-- ============================================================
-- Red de Esperanza — Migración 33: Teléfono de los autores del chat
-- Ejecutar UNA vez en Supabase (SQL Editor).
--
-- Los líderes de voluntarios (y admin) necesitan poder contactar a CUALQUIERA
-- que escriba en el chat, no solo a los invitados. El teléfono de un usuario
-- registrado vive en `perfiles`, cuya RLS solo deja ver el perfil propio (o al
-- admin). Con esta función SECURITY DEFINER, un líder/admin obtiene el teléfono
-- de los autores dados; cualquier otro rol recibe vacío. Cubre también los
-- mensajes ya escritos (resuelve por el id del autor, no por el del mensaje).
-- ============================================================

create or replace function public.telefonos_de_usuarios(p_ids uuid[])
returns table(id uuid, telefono text)
language sql
stable
security definer
set search_path = public
as $$
  select pr.id, pr.telefono
  from perfiles pr
  where pr.id = any(p_ids)
    and public.tiene_rol(array['lider_voluntarios','admin']::rol_usuario[]);
$$;

revoke all on function public.telefonos_de_usuarios(uuid[]) from public;
grant execute on function public.telefonos_de_usuarios(uuid[]) to authenticated;
