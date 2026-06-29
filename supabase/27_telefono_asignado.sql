-- ============================================================
-- 27 — Teléfono de quien atiende, visible SOLO para el reportante
-- ============================================================
-- El reportante de una necesidad necesita poder llamar/escribir a quien se
-- asignó su caso. Pero el teléfono vive en `perfiles`, cuya RLS solo deja ver
-- el perfil propio (o al admin); y la vista pública `perfiles_publicos` NO
-- expone teléfonos a propósito. Para no abrir los teléfonos a todo el mundo,
-- usamos una función SECURITY DEFINER que devuelve el teléfono del asignado
-- únicamente cuando quien la llama es el reportante autenticado de ESE caso.
-- ============================================================

create or replace function public.telefono_de_quien_atiende(p_necesidad_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select pr.telefono
  from necesidades n
  join perfiles pr on pr.id = n.asignado_a
  where n.id = p_necesidad_id
    and n.asignado_a is not null
    -- Solo el reportante autenticado del caso puede verlo.
    and n.reportado_por = auth.uid();
$$;

-- Nadie por defecto; solo usuarios autenticados pueden ejecutarla (la propia
-- función ya filtra para que cada quien solo vea el de SUS reportes).
revoke all on function public.telefono_de_quien_atiende(uuid) from public;
grant execute on function public.telefono_de_quien_atiende(uuid) to authenticated;
