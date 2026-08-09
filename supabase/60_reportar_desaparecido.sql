-- ============================================================
-- Red de Esperanza — Migración 60: reportar un desaparecido (persona o mascota)
-- Ejecutar UNA vez DESPUÉS de la 58, en: SQL Editor → New query → Run
--
-- Hasta ahora `desaparecidos` solo se llenaba con el scraper (service_role,
-- que ignora RLS). Esto permite que cualquier persona REPORTE un desaparecido
-- desde la app (igual que reportar una necesidad), con:
--   · tipo_ser: 'persona' o 'mascota' (para elegir el icono correcto).
--   · reportado_por: quién lo cargó, si estaba autenticado (puede ser null).
--   · el documento (cédula/RUT), SOLO si es persona, va en una tabla aparte
--     y PRIVADA — igual que `contactos_necesidad` — porque es un dato
--     sensible y la tabla `desaparecidos` es de lectura pública.
-- ============================================================

alter table public.desaparecidos add column if not exists tipo_ser text
  check (tipo_ser in ('persona', 'mascota')) default 'persona';
alter table public.desaparecidos add column if not exists reportado_por uuid
  references public.perfiles(id) on delete set null;

-- Registros existentes (todos del scraper) son personas.
update public.desaparecidos set tipo_ser = 'persona' where tipo_ser is null;

-- ===== Documento (PRIVADO) =====
create table if not exists public.desaparecidos_documento (
  desaparecido_id uuid primary key references public.desaparecidos(id) on delete cascade,
  documento text not null,
  creado_en timestamptz not null default now()
);
alter table public.desaparecidos_documento enable row level security;

drop policy if exists "crear documento desaparecido" on public.desaparecidos_documento;
create policy "crear documento desaparecido" on public.desaparecidos_documento
  for insert with check (true);

drop policy if exists "leer documento desaparecido interno" on public.desaparecidos_documento;
create policy "leer documento desaparecido interno" on public.desaparecidos_documento
  for select using (
    public.tiene_rol(array['voluntario','rescatista','verificador','admin','lider_voluntarios']::rol_usuario[])
  );

-- ===== Insertar en `desaparecidos` desde la app =====
-- Solo reportes ciudadanos (fuente fija), para no dejar que cualquiera
-- inserte con la fuente del scraper o marque un estado distinto al inicial.
drop policy if exists "crear desaparecido ciudadano" on public.desaparecidos;
create policy "crear desaparecido ciudadano" on public.desaparecidos
  for insert to anon, authenticated
  with check (fuente = 'reporte_ciudadano' and estado = 'no_encontrado');

-- ===== Storage: fotos de desaparecidos =====
insert into storage.buckets (id, name, public)
values ('desaparecidos', 'desaparecidos', true)
on conflict (id) do nothing;

drop policy if exists "subir foto desaparecido" on storage.objects;
create policy "subir foto desaparecido" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'desaparecidos');
