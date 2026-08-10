-- ============================================================
-- Red de Esperanza — Migración 62: datos fiscales de entidades
-- Ejecutar UNA vez DESPUÉS de la 61, en: SQL Editor → New query → Run
--
-- A las municipalidades y a las empresas privadas se les factura por fuera
-- de la app. Para poder emitir esa factura hacen falta datos que la 61 no
-- pedía: razón social (que casi nunca es igual al nombre público), el
-- identificador fiscal (RUT de empresa en Chile, RIF en Venezuela), la
-- dirección fiscal y a qué correo van las facturas.
--
-- OJO con la diferencia: `nombre` es como se la conoce y se muestra en el
-- mapa ("Bomberos de Coquimbo"); `razon_social` es como aparece en el SII o
-- el SENIAT ("Cuerpo de Bomberos de Coquimbo, persona jurídica sin fines de
-- lucro"). Facturar con el nombre público rebota.
--
-- Se agrega también la categoría 'empresa': una empresa privada que quiere
-- presencia en la red no encajaba en ninguna de las siete anteriores.
-- ============================================================

-- ============================================================
-- 1) Categoría nueva: empresa privada
--    Los CHECK de categoría hay que rehacerlos (no se amplían en sitio).
-- ============================================================
alter table entidades drop constraint if exists entidades_categoria_check;
alter table entidades add constraint entidades_categoria_check
  check (categoria in (
    'bomberos', 'municipalidad', 'rescate', 'animal',
    'psicosocial', 'junta_vecinal', 'empresa', 'profesional'
  ));

alter table solicitudes_entidad drop constraint if exists solicitudes_entidad_categoria_check;
alter table solicitudes_entidad add constraint solicitudes_entidad_categoria_check
  check (categoria in (
    'bomberos', 'municipalidad', 'rescate', 'animal',
    'psicosocial', 'junta_vecinal', 'empresa', 'profesional'
  ));

-- ============================================================
-- 2) Datos fiscales
--    Van en las DOS tablas: en la solicitud para poder cotizar y verificar
--    antes de aprobar, y en la entidad para tenerlos a mano al facturar.
-- ============================================================
alter table solicitudes_entidad
  add column if not exists razon_social text,
  add column if not exists id_fiscal text,
  add column if not exists direccion_fiscal text,
  add column if not exists contacto_facturacion text;

alter table entidades
  add column if not exists razon_social text,
  add column if not exists id_fiscal text,
  add column if not exists direccion_fiscal text,
  add column if not exists contacto_facturacion text,
  -- Si esta entidad se factura. Lo decide el admin AL APROBAR (la categoría
  -- solo sugiere): una municipalidad chica puede ir liberada y una ONG
  -- grande puede aportar. No se deriva de la categoría a la fuerza.
  add column if not exists facturable boolean not null default false;

create index if not exists idx_entidades_facturable
  on entidades (facturable) where facturable;

-- Buscar una entidad por su identificador fiscal (para conciliar facturas).
create index if not exists idx_entidades_id_fiscal on entidades (id_fiscal);

-- ============================================================
-- 3) Los datos fiscales NO son públicos
--    `entidades` se lee sin cuenta (es el perfil público), así que la
--    dirección fiscal y el correo de facturación quedarían a la vista de
--    cualquiera. Se mueven detrás de una vista: el público lee la vista, y
--    la tabla completa queda para el admin y la propia entidad.
-- ============================================================
create or replace view entidades_publicas as
  select
    id, nombre, categoria, tier, profesion, descripcion, logo_url,
    contacto_publico, web, pais, zona, ciudad, lat, lng,
    verificada_en, verificada_por, metodo_verificacion, suspendida, creado_en
  from entidades
  where not suspendida;

grant select on entidades_publicas to anon, authenticated;

-- La lectura directa de `entidades` se restringe: la usan el admin (panel y
-- facturación) y los miembros de la propia entidad (su panel). El resto del
-- mundo pasa por la vista de arriba, que no expone lo fiscal.
drop policy if exists "leer entidades" on entidades;
create policy "leer entidades" on entidades for select
  using (
    public.tiene_rol(array['admin']::rol_usuario[])
    or exists (
      select 1 from entidad_miembros m
      where m.entidad_id = entidades.id and m.perfil_id = auth.uid()
    )
  );

-- ============================================================
-- 4) `facturable` solo lo cambia el admin (es dinero, no configuración).
--    Se suma a la lista de campos bloqueados de la 61.
-- ============================================================
create or replace function public.proteger_identidad_entidad()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.tiene_rol(array['admin']::rol_usuario[]) then
    return NEW;
  end if;
  if NEW.nombre is distinct from OLD.nombre
     or NEW.categoria is distinct from OLD.categoria
     or NEW.tier is distinct from OLD.tier
     or NEW.verificada_en is distinct from OLD.verificada_en
     or NEW.verificada_por is distinct from OLD.verificada_por
     or NEW.metodo_verificacion is distinct from OLD.metodo_verificacion
     or NEW.suspendida is distinct from OLD.suspendida
     or NEW.facturable is distinct from OLD.facturable then
    raise exception 'El nombre, la categoria, la verificacion y el cobro de una entidad solo los cambia el equipo de la red';
  end if;
  return NEW;
end;
$$;

-- ============================================================
-- 5) Aprobar: ahora arrastra los datos fiscales y marca si se factura.
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
    -- Sin identificador fiscal no se puede emitir la factura después, y
    -- perseguirlo una vez aprobados nunca funciona.
    if p_facturable and coalesce(v_sol.id_fiscal, '') = '' then
      raise exception 'Para marcarla como facturable falta su identificador fiscal (RUT/RIF)';
    end if;

    insert into entidades (
      nombre, categoria, tier, profesion, descripcion,
      pais, zona, ciudad, web,
      razon_social, id_fiscal, direccion_fiscal, contacto_facturacion,
      facturable,
      verificada_en, verificada_por, metodo_verificacion
    ) values (
      v_sol.nombre, v_sol.categoria, p_tier, v_sol.profesion, v_sol.descripcion,
      v_sol.pais, v_sol.zona, v_sol.ciudad, v_sol.web,
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

-- La firma cambió (un parámetro más), así que la anterior queda colgando.
drop function if exists public.revisar_solicitud_entidad(uuid, boolean, text, text, text);
revoke all on function public.revisar_solicitud_entidad(uuid, boolean, text, text, text, boolean) from public;
grant execute on function public.revisar_solicitud_entidad(uuid, boolean, text, text, text, boolean) to authenticated;

-- ============================================================
-- 6) handle_new_user(): arrastra también lo fiscal desde el registro.
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
        razon_social, id_fiscal, direccion_fiscal, contacto_facturacion
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
        nullif(v_ent->>'contacto_facturacion','')
      );
    exception when others then
      null;
    end;
  end if;

  return new;
end; $$;
