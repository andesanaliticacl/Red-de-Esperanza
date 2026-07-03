-- ============================================================
-- Red de Esperanza - Migracion 39: cambiar tipo de alerta
-- Ejecutar UNA vez en Supabase (SQL Editor -> New query -> Run).
--
-- Solo admin puede cambiar el tipo de una necesidad. La funcion actualiza
-- exclusivamente la columna `tipo`; no toca estado, ubicacion, contacto,
-- descripcion, origen, asignacion ni ningun otro dato.
-- ============================================================

create or replace function public.cambiar_tipo_necesidad(
  p_id uuid,
  p_tipo necesidad_tipo
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
      from perfiles
     where id = auth.uid()
       and rol = 'admin'
  ) then
    raise exception 'Solo un administrador puede cambiar el tipo de alerta';
  end if;

  update necesidades
     set tipo = p_tipo
   where id = p_id;

  if not found then
    raise exception 'No se encontro la alerta';
  end if;
end;
$$;

revoke all on function public.cambiar_tipo_necesidad(uuid, necesidad_tipo) from public;
grant execute on function public.cambiar_tipo_necesidad(uuid, necesidad_tipo) to authenticated;
