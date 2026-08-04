-- ============================================================
-- Red de Esperanza — Migración 56: endurecer permisos (auditoría de seguridad)
-- Ejecutar UNA vez DESPUÉS de la 55, en: SQL Editor → New query → Run
--
-- Cierra cuatro huecos encontrados en la auditoría:
--   A1) `visitas` permitía a CUALQUIERA modificar CUALQUIER fila.
--   A2) el bucket `avatares` dejaba a cualquier usuario con sesión
--       sobrescribir la foto de OTRA persona (suplantación visual).
--   A3) el límite de 3 reportes/día por teléfono solo se validaba en el
--       navegador: hablando directo con la API se podía saltar (SOS falsos).
--   A4) los buckets no tenían tope de tamaño por archivo.
--
-- Ninguna de estas restricciones cambia lo que ve un usuario honesto.
-- ============================================================

-- ------------------------------------------------------------
-- A1) Visitas: nadie escribe directo en la tabla; solo por función.
-- ------------------------------------------------------------
-- Antes: "visitas_update ... using (true)" dejaba a un anónimo cambiar el
-- país/fecha de cualquier dispositivo y falsear el contador del panel.
-- Ahora: no hay política de INSERT/UPDATE (nadie escribe directo) y el
-- registro pasa por esta función, que SOLO toca la fila del id recibido.
drop policy if exists "visitas_insert" on visitas;
drop policy if exists "visitas_update" on visitas;

create or replace function public.registrar_visita(
  p_visitor_id text,
  p_pais text default null,
  p_ciudad text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Un id de dispositivo razonable (los genera crypto.randomUUID en el
  -- navegador). Evita que se rellene la tabla con basura enorme.
  if p_visitor_id is null or length(p_visitor_id) < 8
     or length(p_visitor_id) > 64 then
    return;
  end if;

  insert into visitas (visitor_id, pais, ciudad, visto_en)
  values (p_visitor_id, left(p_pais, 80), left(p_ciudad, 80), now())
  on conflict (visitor_id) do update
    set pais = excluded.pais,
        ciudad = excluded.ciudad,
        visto_en = now();
end; $$;

grant execute on function public.registrar_visita(text, text, text)
  to anon, authenticated;

-- (La lectura sigue como estaba: solo admin, política "visitas_select_admin".)


-- ------------------------------------------------------------
-- A2) Avatares: cada quien solo escribe en SU carpeta.
-- ------------------------------------------------------------
-- La app ya sube a la ruta "{id_del_perfil}/{timestamp}.webp", así que basta
-- con exigir que la primera carpeta sea el uid de quien sube. No hace falta
-- ningún cambio en el cliente.
drop policy if exists "avatares subir autenticado" on storage.objects;
create policy "avatares subir autenticado" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatares'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatares actualizar autenticado" on storage.objects;
create policy "avatares actualizar autenticado" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatares'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatares'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Poder borrar la propia foto vieja (antes no existía política de delete).
drop policy if exists "avatares borrar propio" on storage.objects;
create policy "avatares borrar propio" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatares'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- (La lectura pública del bucket se mantiene: "avatares lectura publica".)


-- ------------------------------------------------------------
-- A3) Límite de reportes por teléfono, ahora en el SERVIDOR.
-- ------------------------------------------------------------
-- El navegador ya consultaba reportes_hoy_por_telefono() antes de crear, pero
-- eso es solo JavaScript: quien hable directo con la API podía crear reportes
-- y SOS sin freno. Este trigger aplica el mismo límite del lado del servidor.
--
-- El personal interno queda exento: coordinando una emergencia pueden
-- registrar muchas solicitudes legítimas desde un mismo número.
create or replace function public.limitar_reportes_por_telefono()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limite constant int := 3;
  v_hoy int;
begin
  if new.contacto is null or btrim(new.contacto) = '' then
    return new;
  end if;

  if public.tiene_rol(array[
       'voluntario','rescatista','lider_voluntarios',
       'psicologo','lider_psicologo','verificador','admin'
     ]::rol_usuario[]) then
    return new;
  end if;

  select count(*)
    into v_hoy
    from contactos_necesidad c
    join necesidades n on n.id = c.necesidad_id
   where regexp_replace(c.contacto, '\D', '', 'g')
         = regexp_replace(new.contacto, '\D', '', 'g')
     and n.creado_en >= (
       date_trunc('day', now() at time zone 'America/Caracas')
         at time zone 'America/Caracas'
     );

  if v_hoy >= v_limite then
    raise exception 'Ya registraste % solicitudes hoy con este teléfono. Si es una nueva emergencia, llama a los servicios de emergencia de tu país.', v_limite
      using errcode = 'check_violation';
  end if;

  return new;
end; $$;

drop trigger if exists trg_limitar_reportes_por_telefono on contactos_necesidad;
create trigger trg_limitar_reportes_por_telefono
  before insert on contactos_necesidad
  for each row execute procedure public.limitar_reportes_por_telefono();


-- ------------------------------------------------------------
-- A4) Tope de tamaño por archivo en los buckets públicos.
-- ------------------------------------------------------------
-- La app comprime a ~0,3 MB antes de subir, pero eso pasa en el navegador:
-- quien suba directo a la API podía meter archivos enormes. 2 MB deja margen
-- de sobra para una foto comprimida y corta el abuso.
update storage.buckets
   set file_size_limit = 2097152,   -- 2 MB
       allowed_mime_types = array['image/webp','image/jpeg','image/png']
 where id in ('avatares', 'mascotas');
