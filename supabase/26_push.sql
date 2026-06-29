-- ============================================================
-- Red de Esperanza — Migración 26: Notificaciones push (con la app cerrada)
-- Ejecutar UNA vez en: SQL Editor → New query → Run
--
-- Guarda la "suscripción push" de cada dispositivo (la dirección a la que el
-- servidor le manda los avisos). El envío lo hace la Edge Function 'enviar-push'
-- con la llave VAPID privada. Cada usuario gestiona SUS propias suscripciones;
-- el emisor (service role) las lee todas.
-- ============================================================

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references perfiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  creado_en timestamptz not null default now()
);

create index if not exists idx_push_user on push_subscriptions (user_id);

alter table push_subscriptions enable row level security;

-- Cada usuario administra SUS suscripciones (las de sus dispositivos).
drop policy if exists "insertar mi push" on push_subscriptions;
create policy "insertar mi push" on push_subscriptions for insert
  with check (user_id = auth.uid());

drop policy if exists "actualizar mi push" on push_subscriptions;
create policy "actualizar mi push" on push_subscriptions for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "ver mi push" on push_subscriptions;
create policy "ver mi push" on push_subscriptions for select
  using (user_id = auth.uid());

drop policy if exists "borrar mi push" on push_subscriptions;
create policy "borrar mi push" on push_subscriptions for delete
  using (user_id = auth.uid());
