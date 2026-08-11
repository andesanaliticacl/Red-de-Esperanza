-- ============================================================
-- Red de Esperanza — Migración 63: ubicación exacta de la entidad
-- Ejecutar UNA vez DESPUÉS de la 62, en: SQL Editor → New query → Run
--
-- `entidades` ya tenía lat/lng desde la 61, pero la SOLICITUD no: la
-- organización decía su región y nada más, así que al aprobarla no había
-- punto que poner en el mapa y alguien tenía que perseguirlo después.
--
-- Ahora la entidad marca su sede en el mini-mapa al registrarse (solo las
-- categorías con local físico: un veterinario voluntario no tiene sede, un
-- cuartel de bomberos sí), y al aprobar el punto viaja solo.
-- ============================================================

alter table solicitudes_entidad
  add column if not exists lat double precision,
  add column if not exists lng double precision,
  add column if not exists direccion text;

alter table entidades
  add column if not exists direccion text;

-- ============================================================
-- Aprobar: arrastra también el punto y la dirección.
-- ============================================================
create or replace function public.revisar_solicitud_entidad(
  p_id uuid,
  p_aprobar boolean,
  p_tier text default null,
  p_metodo_verificacion text default null,
  p_nota text default null,
  p_facturable boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sol solicitudes_entidad%rowtype;
  v_entidad_id uuid;
begin
  if not public.tiene_rol(array['admin']::rol_usuario[]) then
    raise exception 'Solo un administrador puede revisar solicitudes de entidad';
  end if;

  select * into v_sol
  from solicitudes_entidad
  where id = p_id and estado = 'pendiente';

  if v_sol.id is null then
    raise exception 'La solicitud no existe o ya fue revisada';
  end if;

  if p_aprobar then
    if p_tier is null then
      raise exception 'Falta indicar el nivel de verificacion (tier)';
    end if;
    if p_facturable and coalesce(v_sol.id_fiscal, '') = '' then
      raise exception 'Para marcarla como facturable falta su identificador fiscal (RUT/RIF)';
    end if;

    insert into entidades (
      nombre, categoria, tier, profesion, descripcion,
      pais, zona, ciudad, web, direccion, lat, lng,
      razon_social, id_fiscal, direccion_fiscal, contacto_facturacion,
      facturable,
      verificada_en, verificada_por, metodo_verificacion
    ) values (
      v_sol.nombre, v_sol.categoria, p_tier, v_sol.profesion, v_sol.descripcion,
      v_sol.pais, v_sol.zona, v_sol.ciudad, v_sol.web, v_sol.direccion,
      v_sol.lat, v_sol.lng,
      v_sol.razon_social, v_sol.id_fiscal, v_sol.direccion_fiscal,
      v_sol.contacto_facturacion,
      p_facturable,
      now(), auth.uid(), p_metodo_verificacion
    )
    returning id into v_entidad_id;

    insert into entidad_miembros
      (entidad_id, perfil_id, rol_interno, es_vocero, publico)
    values (v_entidad_id, v_sol.perfil_id, 'admin', true, true)
    on conflict do nothing;

    update perfiles set rol = 'entidad' where id = v_sol.perfil_id;
  end if;

  update solicitudes_entidad
     set estado = case when p_aprobar then 'aprobada' else 'rechazada' end,
         revisado_por = auth.uid(),
         revisado_en = now(),
         nota_revision = p_nota,
         entidad_id = v_entidad_id
   where id = p_id;

  return v_entidad_id;
end;
$$;

-- ============================================================
-- La vista pública suma la dirección (es dato de contacto, no fiscal).
--
-- Va DROP + CREATE, no CREATE OR REPLACE: reemplazar una vista solo permite
-- AGREGAR columnas al final, y aquí `direccion` entra en medio (antes de
-- lat/lng, que es donde se lee bien). Con REPLACE, Postgres lo interpreta
-- como "renombrar la columna lat a direccion" y aborta.
-- ============================================================
drop view if exists entidades_publicas;
create view entidades_publicas as
  select
    id, nombre, categoria, tier, profesion, descripcion, logo_url,
    contacto_publico, web, pais, zona, ciudad, direccion, lat, lng,
    verificada_en, verificada_por, metodo_verificacion, suspendida, creado_en
  from entidades
  where not suspendida;

grant select on entidades_publicas to anon, authenticated;

-- ============================================================
-- handle_new_user(): arrastra el punto marcado en el registro.
-- ============================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
declare
  v_pais text := nullif(new.raw_user_meta_data->>'pais','');
  v_pedido text := new.raw_user_meta_data->>'rol';
  v_nombre text := coalesce(nullif(new.raw_user_meta_data->>'nombre',''), new.email);
  v_rol rol_usuario;
  v_telefono text := nullif(new.raw_user_meta_data->>'telefono','');
  v_ent jsonb := new.raw_user_meta_data->'entidad';
begin
  if v_pedido in ('voluntario','rescatista','centro_acopio') then
    v_rol := v_pedido::rol_usuario;
  else
    v_rol := 'ciudadano';
  end if;
  if v_rol in ('voluntario','rescatista')
     and coalesce(v_pais, 'Venezuela') <> 'Venezuela' then
    v_rol := 'ciudadano';
  end if;

  begin
    insert into public.perfiles
      (id, nombre, rol, tipo_documento, documento, telefono, ciudad, estado, pais)
    values (
      new.id, v_nombre, v_rol,
      nullif(new.raw_user_meta_data->>'tipo_documento',''),
      nullif(new.raw_user_meta_data->>'documento',''),
      v_telefono,
      nullif(new.raw_user_meta_data->>'ciudad',''),
      nullif(new.raw_user_meta_data->>'estado',''),
      v_pais
    );
  exception when others then
    begin
      insert into public.perfiles (id, nombre, rol)
      values (new.id, v_nombre, v_rol)
      on conflict (id) do nothing;
    exception when others then
      null;
    end;
  end;

  if coalesce(new.raw_user_meta_data->>'quiere_psicologo','') = 'true'
     and v_telefono is not null then
    begin
      insert into public.solicitudes_psicologo
        (perfil_id, nombre, telefono, pais, tipo_documento, documento)
      values (
        new.id, v_nombre, v_telefono, v_pais,
        nullif(new.raw_user_meta_data->>'tipo_documento',''),
        nullif(new.raw_user_meta_data->>'documento','')
      );
    exception when others then
      null;
    end;
  end if;

  if v_ent is not null and coalesce(v_ent->>'nombre','') <> '' then
    begin
      insert into public.solicitudes_entidad (
        perfil_id, nombre, categoria, profesion, descripcion,
        pais, zona, ciudad, telefono, email_contacto, web,
        tipo_documento, documento, mensaje,
        razon_social, id_fiscal, direccion_fiscal, contacto_facturacion,
        direccion, lat, lng
      ) values (
        new.id,
        v_ent->>'nombre',
        v_ent->>'categoria',
        nullif(v_ent->>'profesion',''),
        nullif(v_ent->>'descripcion',''),
        v_pais,
        nullif(new.raw_user_meta_data->>'estado',''),
        nullif(new.raw_user_meta_data->>'ciudad',''),
        coalesce(nullif(v_ent->>'telefono',''), v_telefono, 'sin telefono'),
        nullif(v_ent->>'email_contacto',''),
        nullif(v_ent->>'web',''),
        nullif(new.raw_user_meta_data->>'tipo_documento',''),
        nullif(new.raw_user_meta_data->>'documento',''),
        nullif(v_ent->>'mensaje',''),
        nullif(v_ent->>'razon_social',''),
        nullif(v_ent->>'id_fiscal',''),
        nullif(v_ent->>'direccion_fiscal',''),
        nullif(v_ent->>'contacto_facturacion',''),
        nullif(v_ent->>'direccion',''),
        (v_ent->>'lat')::double precision,
        (v_ent->>'lng')::double precision
      );
    exception when others then
      null;
    end;
  end if;

  return new;
end; $$;
