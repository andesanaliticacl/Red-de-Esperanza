-- ============================================================
-- Red de Esperanza — Migración 64: la entidad verifica a su equipo
-- Ejecutar UNA vez DESPUÉS de la 63, en: SQL Editor → New query → Run
--
-- Hasta ahora una entidad aprobada (migración 61) solo tenía UN miembro
-- (quien la registró, como admin/vocero). No existía forma de que esa
-- entidad marcara a sus propios rescatistas/voluntarios como "verificados
-- por mí" — la tabla `entidad_miembros` es para quienes ADMINISTRAN la
-- ficha pública, un permiso mucho más fuerte que no queríamos mezclar con
-- "esta persona trabaja de verdad para nosotros".
--
-- Esta migración agrega una relación NUEVA y más chica:
--   entidad_verificados: qué persona (rol voluntario/rescatista) está
--   avalada por qué entidad. Una persona solo puede estar verificada por
--   UNA entidad a la vez (perfil_id es primary key): evita el lío de dos
--   organizaciones reclamando al mismo rescatista.
--
-- Reglas de permiso (todo pasa por funciones security definer, nunca INSERT/
-- UPDATE/DELETE directo del cliente, para poder validar SIEMPRE el rol del
-- objetivo y quién puede tocar qué):
--   · Admin de la red: verifica/quita a cualquiera, de cualquier entidad.
--   · Admin de una entidad (entidad_miembros.rol_interno='admin'): solo
--     puede verificar/quitar personas DE SU PROPIA entidad, y solo si esa
--     persona tiene rol voluntario o rescatista.
--   · Nadie puede "robarle" a otra entidad un rescatista ya verificado por
--     ella (salvo el admin de la red).
-- ============================================================

create table if not exists entidad_verificados (
  -- Primary key en perfil_id (no compuesta): una persona, una sola entidad
  -- que responde por ella. Si cambia de organización, primero hay que
  -- quitarle la verificación anterior.
  perfil_id uuid primary key references perfiles(id) on delete cascade,
  entidad_id uuid not null references entidades(id) on delete cascade,
  verificado_por uuid references perfiles(id) on delete set null,
  verificado_en timestamptz not null default now(),
  nota text
);

create index if not exists idx_entidad_verificados_entidad
  on entidad_verificados (entidad_id);

alter table entidad_verificados enable row level security;

-- Lectura pública: el check de "verificado por X" se muestra a cualquiera
-- que vea el mapa o el chat, con o sin cuenta — es justamente la insignia
-- que se pidió que fuera visible.
drop policy if exists "leer verificados" on entidad_verificados;
create policy "leer verificados" on entidad_verificados for select using (true);

-- Sin políticas de insert/update/delete a propósito: todo pasa por las
-- funciones de abajo (security definer), que validan rol del objetivo y
-- pertenencia a la entidad antes de tocar la fila.

-- ============================================================
-- Helper: ¿el usuario actual administra ESTA entidad? (o es admin de red)
-- ============================================================
create or replace function public.es_admin_de_entidad(p_entidad_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.tiene_rol(array['admin']::rol_usuario[])
    or exists (
      select 1 from entidad_miembros m
      where m.entidad_id = p_entidad_id
        and m.perfil_id = auth.uid()
        and m.rol_interno = 'admin'
    );
$$;

-- ============================================================
-- Buscar candidato por teléfono: solo lo puede usar quien administra AL
-- MENOS una entidad (o admin de red). Hay que conocer el teléfono exacto
-- de la persona (se lo pide directamente) — no es un buscador libre de
-- usuarios, para no exponer datos de nadie más.
-- ============================================================
create or replace function public.entidad_buscar_candidato(p_telefono text)
returns table (
  id uuid,
  nombre text,
  rol rol_usuario,
  telefono text,
  pais text,
  ciudad text,
  ya_verificado_por uuid,
  ya_verificado_entidad text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (
    public.tiene_rol(array['admin']::rol_usuario[])
    or exists (
      select 1 from entidad_miembros m
      where m.perfil_id = auth.uid() and m.rol_interno = 'admin'
    )
  ) then
    raise exception 'Solo el equipo de una entidad puede buscar candidatos';
  end if;

  return query
    select
      p.id, p.nombre, p.rol, p.telefono, p.pais, p.ciudad,
      ev.entidad_id, e.nombre
    from perfiles p
    left join entidad_verificados ev on ev.perfil_id = p.id
    left join entidades e on e.id = ev.entidad_id
    where p.telefono = p_telefono
      and p.rol::text in ('voluntario', 'rescatista');
end;
$$;

revoke all on function public.entidad_buscar_candidato(text) from public;
grant execute on function public.entidad_buscar_candidato(text) to authenticated;

-- ============================================================
-- Verificar (o re-confirmar) a un miembro del equipo.
-- ============================================================
create or replace function public.entidad_verificar_miembro(
  p_entidad_id uuid,
  p_perfil_id uuid,
  p_nota text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol rol_usuario;
  v_dueno_actual uuid;
begin
  if not public.es_admin_de_entidad(p_entidad_id) then
    raise exception 'No administras esta entidad';
  end if;

  select rol into v_rol from perfiles where id = p_perfil_id;
  if v_rol is null then
    raise exception 'Esa persona no existe';
  end if;
  if v_rol::text not in ('voluntario', 'rescatista') then
    raise exception 'Solo se puede verificar a voluntarios o rescatistas';
  end if;

  select entidad_id into v_dueno_actual
  from entidad_verificados where perfil_id = p_perfil_id;

  if v_dueno_actual is not null and v_dueno_actual <> p_entidad_id
     and not public.tiene_rol(array['admin']::rol_usuario[]) then
    raise exception 'Esta persona ya está verificada por otra entidad';
  end if;

  insert into entidad_verificados (perfil_id, entidad_id, verificado_por, nota)
  values (p_perfil_id, p_entidad_id, auth.uid(), nullif(trim(p_nota), ''))
  on conflict (perfil_id) do update
    set entidad_id = excluded.entidad_id,
        verificado_por = excluded.verificado_por,
        verificado_en = now(),
        nota = excluded.nota;
end;
$$;

revoke all on function public.entidad_verificar_miembro(uuid, uuid, text) from public;
grant execute on function public.entidad_verificar_miembro(uuid, uuid, text) to authenticated;

-- ============================================================
-- Quitar la verificación (deja de ser "de esta entidad").
-- ============================================================
create or replace function public.entidad_quitar_verificacion(p_perfil_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entidad_id uuid;
begin
  select entidad_id into v_entidad_id
  from entidad_verificados where perfil_id = p_perfil_id;

  if v_entidad_id is null then
    raise exception 'Esa persona no está verificada por ninguna entidad';
  end if;

  if not public.es_admin_de_entidad(v_entidad_id) then
    raise exception 'No administras la entidad que verificó a esta persona';
  end if;

  delete from entidad_verificados where perfil_id = p_perfil_id;
end;
$$;

revoke all on function public.entidad_quitar_verificacion(uuid) from public;
grant execute on function public.entidad_quitar_verificacion(uuid) to authenticated;

-- ============================================================
-- Listar el equipo verificado de una entidad, CON teléfono (privado): solo
-- para quien administra esa entidad o el admin de la red. La lectura
-- pública de entidad_verificados (arriba) NO incluye teléfono a propósito.
-- ============================================================
create or replace function public.entidad_listar_equipo(p_entidad_id uuid)
returns table (
  perfil_id uuid,
  nombre text,
  rol rol_usuario,
  telefono text,
  verificado_en timestamptz,
  verificado_por uuid,
  nota text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.es_admin_de_entidad(p_entidad_id) then
    raise exception 'No administras esta entidad';
  end if;

  return query
    select p.id, p.nombre, p.rol, p.telefono,
           ev.verificado_en, ev.verificado_por, ev.nota
    from entidad_verificados ev
    join perfiles p on p.id = ev.perfil_id
    where ev.entidad_id = p_entidad_id
    order by ev.verificado_en desc;
end;
$$;

revoke all on function public.entidad_listar_equipo(uuid) from public;
grant execute on function public.entidad_listar_equipo(uuid) to authenticated;

-- ============================================================
-- perfiles_publicos: se agrega la insignia de verificación (entidad, tier,
-- categoría) para poder mostrarla junto al nombre en cualquier parte de la
-- app (chat, "atiende…", mapa) sin exponer nada privado — mismo criterio
-- que el resto de la vista (solo id/nombre/rol hasta ahora).
-- ============================================================
create or replace view perfiles_publicos as
  select
    -- Columnas existentes, MISMO ORDEN (migración 12): CREATE OR REPLACE
    -- VIEW no deja renombrar ni reordenar columnas ya publicadas, solo
    -- agregar nuevas al final.
    p.id, p.nombre, p.rol, p.foto_url, p.ciudad,
    ev.entidad_id as verificado_entidad_id,
    e.nombre as verificado_entidad_nombre,
    e.tier as verificado_entidad_tier,
    e.categoria as verificado_entidad_categoria
  from perfiles p
  left join entidad_verificados ev on ev.perfil_id = p.id
  left join entidades e on e.id = ev.entidad_id;

grant select on perfiles_publicos to anon, authenticated;
