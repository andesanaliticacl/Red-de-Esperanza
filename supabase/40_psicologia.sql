-- ============================================================
-- Red de Esperanza - Migracion 40: roles y alertas de psicologia
-- Ejecutar en Supabase SQL Editor para probar en local/remoto.
-- ============================================================

alter type rol_usuario add value if not exists 'psicologo';
alter type rol_usuario add value if not exists 'lider_psicologo';
alter type necesidad_tipo add value if not exists 'atencion_psicologica';

-- Permite que el registro desde el cliente acepte psicologo, pero no lider.
drop policy if exists "crear mi perfil" on perfiles;
create policy "crear mi perfil" on perfiles for insert
  with check (
    auth.uid() = id
    and rol::text in (
      'ciudadano',
      'voluntario',
      'rescatista',
      'psicologo',
      'centro_acopio'
    )
  );

-- Roles de psicologia: solo ellos y admin pueden ver/atender alertas psicologicas.
create or replace function public.es_equipo_psicologia()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from perfiles
    where id = auth.uid()
      and rol::text in ('admin', 'lider_psicologo', 'psicologo')
  );
$$;

-- Equivalencias de permisos:
-- - psicologo actua como rescatista/voluntario, ademas de su rol propio.
-- - lider_psicologo actua como lider/psicologo/rescatista/voluntario.
-- - lider_voluntarios conserva sus permisos previos.
create or replace function public.tiene_rol(roles rol_usuario[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from perfiles p
    where p.id = auth.uid()
      and (
        p.rol = any(roles)
        or (
          p.rol::text = 'lider_voluntarios'
          and exists (
            select 1
            from unnest(roles) r
            where r::text in (
              'voluntario',
              'rescatista',
              'centro_acopio',
              'acopio_admin'
            )
          )
        )
        or (
          p.rol::text = 'psicologo'
          and exists (
            select 1
            from unnest(roles) r
            where r::text in ('voluntario', 'rescatista', 'psicologo')
          )
        )
        or (
          p.rol::text = 'lider_psicologo'
          and exists (
            select 1
            from unnest(roles) r
            where r::text in (
              'voluntario',
              'rescatista',
              'psicologo',
              'lider_psicologo',
              'centro_acopio',
              'acopio_admin'
            )
          )
        )
      )
  );
$$;

-- Nadie puede autoasignarse roles privilegiados. Psicologo requiere Venezuela.
create or replace function public.proteger_rol()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.rol is distinct from OLD.rol then
    if NEW.rol::text in (
      'verificador',
      'admin',
      'acopio_admin',
      'lider_voluntarios',
      'lider_psicologo'
    )
       and not public.tiene_rol(array['admin']::rol_usuario[]) then
      raise exception 'No puedes asignarte el rol %', NEW.rol;
    end if;

    if NEW.rol::text in ('voluntario', 'rescatista', 'psicologo')
       and coalesce(NEW.pais, 'Venezuela') <> 'Venezuela'
       and not public.tiene_rol(array['admin']::rol_usuario[]) then
      raise exception 'Solo puedes ser % si estas en Venezuela', NEW.rol;
    end if;
  end if;
  return NEW;
end;
$$;

-- Crear necesidades: se mantiene abierto para reportes publicos, incluyendo
-- atencion psicologica sin ubicacion. La privacidad se controla en SELECT.
drop policy if exists "crear necesidad" on necesidades;
create policy "crear necesidad" on necesidades for insert with check (true);

-- Lectura de necesidades:
-- - Lo normal activo sigue visible como antes.
-- - Atencion psicologica solo para admin, lider_psicologo, psicologo y el creador.
-- - Verificador/admin conservan lectura amplia de necesidades no psicologicas.
drop policy if exists "leer necesidades" on necesidades;
create policy "leer necesidades" on necesidades for select using (
  (
    tipo::text <> 'atencion_psicologica'
    and estado <> 'rechazada'
    and coalesce(eliminada_del_mapa, false) = false
  )
  or public.tiene_rol(array['admin']::rol_usuario[])
  or (
    tipo::text <> 'atencion_psicologica'
    and public.tiene_rol(array['verificador']::rol_usuario[])
  )
  or (
    tipo::text <> 'atencion_psicologica'
    and coalesce(eliminada_del_mapa, false) = true
    and public.tiene_rol(array['voluntario','rescatista']::rol_usuario[])
  )
  or (
    tipo::text = 'atencion_psicologica'
    and estado <> 'rechazada'
    and coalesce(eliminada_del_mapa, false) = false
    and (public.es_equipo_psicologia() or reportado_por = auth.uid())
  )
  or (
    tipo::text = 'atencion_psicologica'
    and coalesce(eliminada_del_mapa, false) = true
    and public.es_equipo_psicologia()
  )
);

-- Actualizacion: los roles generales no pueden tocar necesidades psicologicas.
drop policy if exists "actualizar interno" on necesidades;
create policy "actualizar interno" on necesidades for update
  using (
    (
      tipo::text <> 'atencion_psicologica'
      and public.tiene_rol(
        array['voluntario','rescatista','verificador','admin']::rol_usuario[]
      )
    )
    or (
      tipo::text = 'atencion_psicologica'
      and public.es_equipo_psicologia()
    )
  )
  with check (
    (
      tipo::text <> 'atencion_psicologica'
      and public.tiene_rol(
        array['voluntario','rescatista','verificador','admin']::rol_usuario[]
      )
    )
    or (
      tipo::text = 'atencion_psicologica'
      and public.es_equipo_psicologia()
    )
  );

-- Contactos privados de necesidades: no filtrar por frontend solamente.
drop policy if exists "leer contacto interno" on contactos_necesidad;
create policy "leer contacto interno" on contactos_necesidad for select using (
  exists (
    select 1
    from necesidades n
    where n.id = contactos_necesidad.necesidad_id
      and (
        (
          n.tipo::text <> 'atencion_psicologica'
          and public.tiene_rol(
            array['voluntario','rescatista','verificador','admin']::rol_usuario[]
          )
        )
        or (
          n.tipo::text = 'atencion_psicologica'
          and (public.es_equipo_psicologia() or n.reportado_por = auth.uid())
        )
      )
  )
);

-- Mensajes de casos: mismos limites por tipo de necesidad.
drop policy if exists "leer mensajes" on mensajes;
create policy "leer mensajes" on mensajes for select using (
  exists (
    select 1
    from necesidades n
    where n.id = mensajes.necesidad_id
      and (
        (
          n.tipo::text <> 'atencion_psicologica'
          and (
            public.tiene_rol(
              array['voluntario','rescatista','verificador','admin']::rol_usuario[]
            )
            or n.reportado_por = auth.uid()
            or n.asignado_a = auth.uid()
          )
        )
        or (
          n.tipo::text = 'atencion_psicologica'
          and (
            public.es_equipo_psicologia()
            or n.reportado_por = auth.uid()
            or n.asignado_a = auth.uid()
          )
        )
      )
  )
);

drop policy if exists "crear mensajes" on mensajes;
create policy "crear mensajes" on mensajes for insert with check (
  autor = auth.uid()
  and exists (
    select 1
    from necesidades n
    where n.id = mensajes.necesidad_id
      and (
        (
          n.tipo::text <> 'atencion_psicologica'
          and (
            public.tiene_rol(
              array['voluntario','rescatista','verificador','admin']::rol_usuario[]
            )
            or n.reportado_por = auth.uid()
            or n.asignado_a = auth.uid()
          )
        )
        or (
          n.tipo::text = 'atencion_psicologica'
          and (
            public.es_equipo_psicologia()
            or n.reportado_por = auth.uid()
            or n.asignado_a = auth.uid()
          )
        )
      )
  )
);

-- Notas de cierre: proteger tambien las notas de atencion psicologica.
drop policy if exists "crear nota cierre" on notas_cierre;
create policy "crear nota cierre" on notas_cierre for insert with check (
  exists (
    select 1
    from necesidades n
    where n.id = notas_cierre.necesidad_id
      and (
        (
          n.tipo::text <> 'atencion_psicologica'
          and public.tiene_rol(
            array['voluntario','rescatista','lider_voluntarios','verificador','admin']::rol_usuario[]
          )
        )
        or (
          n.tipo::text = 'atencion_psicologica'
          and public.es_equipo_psicologia()
        )
      )
  )
);

drop policy if exists "leer nota cierre" on notas_cierre;
create policy "leer nota cierre" on notas_cierre for select using (
  exists (
    select 1
    from necesidades n
    where n.id = notas_cierre.necesidad_id
      and (
        (
          n.tipo::text <> 'atencion_psicologica'
          and public.tiene_rol(
            array['voluntario','rescatista','lider_voluntarios','verificador','admin']::rol_usuario[]
          )
        )
        or (
          n.tipo::text = 'atencion_psicologica'
          and public.es_equipo_psicologia()
        )
      )
  )
);

-- Lider psicologo puede ver contactos del chat global igual que lider voluntario.
drop policy if exists "leer contacto chat" on chat_contactos;
create policy "leer contacto chat" on chat_contactos for select using (
  exists (
    select 1
    from perfiles p
    where p.id = auth.uid()
      and p.rol::text in ('lider_voluntarios', 'lider_psicologo', 'admin')
  )
);

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
    and exists (
      select 1
      from perfiles p
      where p.id = auth.uid()
        and p.rol::text in ('lider_voluntarios', 'lider_psicologo', 'admin')
    );
$$;

revoke all on function public.telefonos_de_usuarios(uuid[]) from public;
grant execute on function public.telefonos_de_usuarios(uuid[]) to authenticated;

-- Lider psicologo puede eliminar/restaurar del mapa igual que un lider.
create or replace function public.eliminar_necesidad_del_mapa(
  p_id uuid,
  p_eliminar boolean default true,
  p_motivo text default null
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
      and rol::text in ('admin', 'lider_voluntarios', 'lider_psicologo')
  ) then
    raise exception 'Solo un lider o un administrador puede eliminar solicitudes del mapa';
  end if;

  update necesidades
     set eliminada_del_mapa = p_eliminar,
         eliminada_en = case when p_eliminar then now() else null end,
         eliminada_por = case when p_eliminar then auth.uid() else null end,
         motivo_eliminacion = case when p_eliminar then p_motivo else null end
   where id = p_id;
end;
$$;

grant execute on function public.eliminar_necesidad_del_mapa(uuid, boolean, text) to authenticated;

-- Si el lider psicologo debe operar como lider, conserva acceso a centros.
drop policy if exists "editar acopio" on centros_acopio;
create policy "editar acopio" on centros_acopio for update using (
  exists (
    select 1
    from perfiles p
    where p.id = auth.uid()
      and p.rol::text in (
        'admin',
        'acopio_admin',
        'lider_voluntarios',
        'lider_psicologo'
      )
  )
  or creado_por = auth.uid()
);

drop policy if exists "borrar acopio" on centros_acopio;
create policy "borrar acopio" on centros_acopio for delete using (
  exists (
    select 1
    from perfiles p
    where p.id = auth.uid()
      and p.rol::text in (
        'admin',
        'acopio_admin',
        'lider_voluntarios',
        'lider_psicologo'
      )
  )
  or creado_por = auth.uid()
);
