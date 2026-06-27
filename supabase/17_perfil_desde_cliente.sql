-- ============================================================
-- Red de Esperanza — Migración 17: crear el perfil desde el CLIENTE
-- Ejecutar en el SQL Editor de Supabase.
--
-- CAMBIO DE ENFOQUE: el perfil ya NO se crea con un trigger en auth.users
-- (eso hacía que el registro diera 500 si el trigger fallaba). Ahora el registro
-- solo crea el usuario de Auth, y la app crea el perfil después, ya con sesión.
-- Así el signup NUNCA puede fallar por la base de datos.
-- ============================================================

-- 1) Quitar el trigger que creaba el perfil al registrarse.
drop trigger if exists on_auth_user_created on auth.users;

-- 2) Asegurar que existe la columna país (por si acaso).
alter table public.perfiles add column if not exists pais text;

-- 3) Permitir que cada usuario cree su PROPIO perfil (rol NO privilegiado:
--    nadie puede auto-asignarse verificador/admin).
drop policy if exists "crear mi perfil" on perfiles;
create policy "crear mi perfil" on perfiles for insert
  with check (
    auth.uid() = id
    and rol in ('ciudadano','voluntario','rescatista','centro_acopio')
  );
