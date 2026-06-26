-- ============================================================
-- Red de Esperanza — Migración 02: Analítica (registro de acciones)
-- Ejecutar UNA vez DESPUÉS de schema.sql, en: SQL Editor → New query → Run
--
-- Registra automáticamente CADA acción importante en una tabla `eventos`,
-- para poder analizar después: cuántos reportes creó/atendió cada persona,
-- cuántas verificaciones hizo un verificador, actividad por ciudad/estado, etc.
-- Se hace con TRIGGERS en la base de datos (no en la app), así que es
-- imposible de saltarse y también captura lo que entra por el bot de Telegram.
-- ============================================================

create type evento_tipo as enum (
  'cuenta_creada',
  'reporte_creado',
  'sos_creado',
  'reporte_verificado',
  'reporte_rechazado',
  'reporte_asignado',
  'reporte_resuelto',
  'mensaje_enviado'
);

create table eventos (
  id uuid primary key default gen_random_uuid(),
  tipo evento_tipo not null,
  necesidad_id uuid references necesidades(id) on delete set null,
  actor uuid references perfiles(id),  -- quién hizo la acción (null si anónimo)
  rol_actor rol_usuario,               -- rol del actor en ese momento (para análisis)
  datos jsonb not null default '{}',   -- detalles extra (tipo, urgencia, ciudad, etc.)
  creado_en timestamptz not null default now()
);
create index on eventos (tipo, creado_en desc);
create index on eventos (actor);
create index on eventos (necesidad_id);

-- ===== Registro automático de cambios en NECESIDADES =====
create or replace function public.log_necesidad() returns trigger
  language plpgsql security definer as $$
declare
  v_actor uuid := auth.uid();
  v_rol rol_usuario;
begin
  if (TG_OP = 'INSERT') then
    select rol into v_rol from perfiles where id = new.reportado_por;
    insert into eventos(tipo, necesidad_id, actor, rol_actor, datos)
    values (
      case when new.origen = 'sos' then 'sos_creado'::evento_tipo
           else 'reporte_creado'::evento_tipo end,
      new.id, new.reportado_por, v_rol,
      jsonb_build_object('tipo', new.tipo, 'urgencia', new.urgencia, 'origen', new.origen, 'zona', new.zona)
    );
  elsif (TG_OP = 'UPDATE' and new.estado is distinct from old.estado) then
    select rol into v_rol from perfiles where id = v_actor;
    insert into eventos(tipo, necesidad_id, actor, rol_actor, datos)
    values (
      (case new.estado
        when 'verificada' then 'reporte_verificado'
        when 'rechazada'  then 'reporte_rechazado'
        when 'en_proceso' then 'reporte_asignado'
        when 'resuelta'   then 'reporte_resuelto'
        else 'reporte_verificado'
      end)::evento_tipo,
      new.id, v_actor, v_rol,
      jsonb_build_object('estado_anterior', old.estado, 'estado_nuevo', new.estado,
                         'tipo', new.tipo, 'asignado_a', new.asignado_a)
    );
  end if;
  return new;
end; $$;

create trigger trg_log_necesidad_insert after insert on necesidades
  for each row execute procedure public.log_necesidad();
create trigger trg_log_necesidad_update after update on necesidades
  for each row execute procedure public.log_necesidad();

-- ===== Registro automático de MENSAJES =====
create or replace function public.log_mensaje() returns trigger
  language plpgsql security definer as $$
declare v_rol rol_usuario;
begin
  select rol into v_rol from perfiles where id = new.autor;
  insert into eventos(tipo, necesidad_id, actor, rol_actor)
  values ('mensaje_enviado', new.necesidad_id, new.autor, v_rol);
  return new;
end; $$;
create trigger trg_log_mensaje after insert on mensajes
  for each row execute procedure public.log_mensaje();

-- ===== Registro automático de CUENTAS NUEVAS =====
create or replace function public.log_cuenta() returns trigger
  language plpgsql security definer as $$
begin
  insert into eventos(tipo, actor, rol_actor, datos)
  values ('cuenta_creada', new.id, new.rol,
          jsonb_build_object('ciudad', new.ciudad, 'estado', new.estado));
  return new;
end; $$;
create trigger trg_log_cuenta after insert on perfiles
  for each row execute procedure public.log_cuenta();

-- ===== Seguridad: solo verificadores/admin pueden LEER el registro =====
-- (No hay política de INSERT: nadie inserta a mano; solo los triggers,
--  que corren con privilegios elevados. Así el registro es confiable.)
alter table eventos enable row level security;
create policy "leer eventos staff" on eventos for select
  using (public.tiene_rol(array['verificador','admin']::rol_usuario[]));

-- ============================================================
-- Vista de estadísticas por persona (para el panel de análisis).
-- security_invoker = on → respeta la RLS (solo staff la puede consultar).
-- ============================================================
create view estadisticas_usuario with (security_invoker = on) as
select
  p.id, p.nombre, p.rol, p.ciudad, p.estado,
  count(*) filter (where e.tipo = 'reporte_creado')     as reportes_creados,
  count(*) filter (where e.tipo = 'sos_creado')         as sos_creados,
  count(*) filter (where e.tipo = 'reporte_resuelto')   as atendidos_resueltos,
  count(*) filter (where e.tipo = 'reporte_verificado') as verificaciones,
  count(*) filter (where e.tipo = 'mensaje_enviado')    as mensajes_enviados,
  max(e.creado_en)                                      as ultima_actividad
from perfiles p
left join eventos e on e.actor = p.id
group by p.id, p.nombre, p.rol, p.ciudad, p.estado;
