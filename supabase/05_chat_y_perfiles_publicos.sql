-- ============================================================
-- Red de Esperanza — Migración 05: Chat global + perfiles públicos
-- Ejecutar UNA vez DESPUÉS de schema.sql, en: SQL Editor → New query → Run
--
-- 1) chat_global: un chat comunitario en tiempo real, agrupado por ciudad, para
--    que la gente de una misma zona se comunique desde la página principal.
-- 2) perfiles_publicos: vista mínima (id, nombre, rol) para poder mostrar
--    "atendido por …" sin exponer datos sensibles del perfil (documento, etc.).
-- ============================================================

-- ===== 1) Chat global por ciudad =====
create table if not exists chat_global (
  id uuid primary key default gen_random_uuid(),
  ciudad text not null,
  nombre text not null,                 -- nombre/apodo visible del autor
  cuerpo text not null,
  autor uuid references perfiles(id),   -- null si el autor es anónimo
  creado_en timestamptz not null default now()
);
create index if not exists idx_chat_ciudad on chat_global (ciudad, creado_en);

alter table chat_global enable row level security;

-- Leer: cualquiera (es un chat público de la comunidad).
drop policy if exists "leer chat global" on chat_global;
create policy "leer chat global" on chat_global for select using (true);

-- Escribir: cualquiera (anónimo incluido), con límites básicos anti-spam.
drop policy if exists "escribir chat global" on chat_global;
create policy "escribir chat global" on chat_global for insert with check (
  char_length(cuerpo) between 1 and 500
  and char_length(nombre) between 1 and 40
  and char_length(ciudad) between 1 and 60
);

-- Realtime para que los mensajes lleguen al instante.
alter publication supabase_realtime add table chat_global;

-- ===== 2) Vista pública de perfiles (solo id, nombre, rol) =====
-- security_invoker OFF (por defecto) → la vista lee la tabla con permisos del
-- dueño y omite la RLS de `perfiles`, pero SOLO expone columnas no sensibles.
create or replace view perfiles_publicos as
  select id, nombre, rol from perfiles;

grant select on perfiles_publicos to anon, authenticated;
