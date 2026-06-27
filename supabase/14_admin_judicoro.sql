-- ============================================================
-- Red de Esperanza — Migración 14: usuario ADMIN judicoro02@gmail.com
-- Ejecutar en el SQL Editor de Supabase (con el rol por defecto del editor,
-- que puede escribir en el esquema auth).
--
-- Crea (o recrea) el usuario con su contraseña y lo deja como admin.
-- El panel de admin vive en una URL poco adivinable (/panel-x7k2), no en /admin.
-- ============================================================

create extension if not exists pgcrypto with schema extensions;

do $$
declare
  v_uid uuid := gen_random_uuid();
begin
  -- Borrar cualquier cuenta previa con ese correo (cascada borra su perfil).
  delete from auth.users where email = 'judicoro02@gmail.com';

  -- Crear el usuario de Auth con la contraseña indicada, ya confirmado.
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data, is_super_admin
  ) values (
    '00000000-0000-0000-0000-000000000000', v_uid,
    'authenticated', 'authenticated',
    'judicoro02@gmail.com',
    crypt('e-*R;TNQu87ixZ#', gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"nombre":"Admin","rol":"ciudadano","pais":"Venezuela"}'::jsonb,
    false
  );

  -- Identidad de email (necesaria para iniciar sesión con correo/contraseña).
  insert into auth.identities (
    provider_id, user_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  ) values (
    v_uid, v_uid,
    jsonb_build_object('sub', v_uid::text, 'email', 'judicoro02@gmail.com', 'email_verified', true),
    'email', now(), now(), now()
  );
end $$;

-- El trigger handle_new_user ya creó el perfil; lo volvemos admin.
-- (Desactivamos proteger_rol un momento: bloquea auto-asignarse admin.)
alter table public.perfiles disable trigger trg_proteger_rol;

update public.perfiles
set rol = 'admin', nombre = coalesce(nullif(nombre, ''), 'Admin')
where id = (select id from auth.users where email = 'judicoro02@gmail.com');

alter table public.perfiles enable trigger trg_proteger_rol;

-- Verificación: debe devolver una fila con rol = admin.
select p.id, u.email, p.nombre, p.rol
from public.perfiles p
join auth.users u on u.id = p.id
where u.email = 'judicoro02@gmail.com';
