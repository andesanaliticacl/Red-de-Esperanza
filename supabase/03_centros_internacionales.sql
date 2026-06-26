-- ============================================================
-- Red de Esperanza — Migración 03: Centros de acopio internacionales
-- Ejecutar UNA vez DESPUÉS de schema.sql, en: SQL Editor → New query → Run
--
-- Permite registrar centros de acopio en OTROS países (Chile, etc.) cuyo fin es
-- recolectar ayuda humanitaria para enviar a Venezuela. Así, quien quiere ayudar
-- desde el exterior encuentra el centro más cercano en su país.
-- ============================================================

alter table centros_acopio
  add column if not exists pais text not null default 'Venezuela',
  add column if not exists ciudad text,
  add column if not exists direccion text,
  add column if not exists creado_por uuid references perfiles(id);

create index if not exists idx_acopio_pais on centros_acopio (pais);

-- ===== Permisos: quién puede registrar/editar centros =====
-- Lectura pública ya existe ("leer acopio" using true). Reemplazamos la política
-- de gestión (antes solo admin) para que el rol 'centro_acopio' registre el suyo.
drop policy if exists "admin acopio" on centros_acopio;

-- Insertar: admin o cualquier usuario con rol 'centro_acopio'.
create policy "crear acopio" on centros_acopio for insert with check (
  public.tiene_rol(array['admin','centro_acopio']::rol_usuario[])
);

-- Editar / borrar: admin, o el dueño que lo creó.
create policy "editar acopio propio" on centros_acopio for update using (
  public.tiene_rol(array['admin']::rol_usuario[]) or creado_por = auth.uid()
);
create policy "borrar acopio propio" on centros_acopio for delete using (
  public.tiene_rol(array['admin']::rol_usuario[]) or creado_por = auth.uid()
);
