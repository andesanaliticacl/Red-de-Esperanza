-- ============================================================
-- Red de Esperanza — Migración 31: Teléfono del chat PRIVADO
-- Ejecutar UNA vez en Supabase (SQL Editor). Reemplaza a la 30.
--
-- El teléfono del invitado NO debe verlo todo el chat. Antes (migración 30)
-- estaba en una columna de `chat_global`, que es pública y además viaja por
-- Realtime → lo veía cualquiera. Aquí lo quitamos de ahí y lo guardamos en una
-- tabla aparte que SOLO pueden leer los líderes de voluntarios (y admin).
-- ============================================================

-- 1) Quitar la columna pública (si se llegó a crear con la migración 30).
alter table chat_global drop column if exists telefono;

-- 2) Tabla privada: un teléfono por mensaje del chat.
create table if not exists chat_contactos (
  mensaje_id uuid primary key references chat_global(id) on delete cascade,
  telefono text not null,
  creado_en timestamptz not null default now()
);

alter table chat_contactos enable row level security;

-- Insertar: cualquiera que escriba en el chat puede adjuntar su teléfono.
drop policy if exists "crear contacto chat" on chat_contactos;
create policy "crear contacto chat" on chat_contactos for insert with check (true);

-- Leer: SOLO líderes de voluntarios y admin (son quienes contactan).
drop policy if exists "leer contacto chat" on chat_contactos;
create policy "leer contacto chat" on chat_contactos for select using (
  public.tiene_rol(array['lider_voluntarios','admin']::rol_usuario[])
);
