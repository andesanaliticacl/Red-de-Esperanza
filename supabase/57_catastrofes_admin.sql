-- ============================================================
-- Red de Esperanza — Migración 57: las catástrofes las define el equipo
-- Ejecutar UNA vez DESPUÉS de la 56, en: SQL Editor → New query → Run
--
-- Antes, CUALQUIER persona con cuenta podía crear una catástrofe desde el
-- formulario de reporte, y también elegir a cuál pertenecía su reporte. Eso
-- ensuciaba los datos (eventos duplicados, mal escritos o mal asignados) y
-- le ponía una decisión de coordinación a quien solo quiere pedir ayuda.
--
-- Ahora:
--   · Solo admin y líderes crean/editan catástrofes (desde el panel).
--   · Se agrega `ciudad`: con país + ciudad, la app puede asignar sola la
--     catástrofe que corresponde al reporte, sin preguntarle nada a nadie.
-- ============================================================

-- Ciudad de la catástrofe (junto al país que ya existía). Permite afinar la
-- asignación automática: dos emergencias en el mismo país no se confunden.
alter table catastrofes add column if not exists ciudad text;

-- Crear: solo el equipo de coordinación.
drop policy if exists "crear catastrofe" on catastrofes;
create policy "crear catastrofe" on catastrofes for insert
  with check (
    public.tiene_rol(array[
      'admin','lider_voluntarios','lider_psicologo'
    ]::rol_usuario[])
  );

-- Editar (corregir nombre, país o ciudad): mismo grupo.
drop policy if exists "editar catastrofe" on catastrofes;
create policy "editar catastrofe" on catastrofes for update
  using (
    public.tiene_rol(array[
      'admin','lider_voluntarios','lider_psicologo'
    ]::rol_usuario[])
  );

-- Borrar: solo admin (los reportes ligados quedan con catastrofe_id nulo,
-- por el "on delete set null" que ya tenía la columna).
drop policy if exists "borrar catastrofe" on catastrofes;
create policy "borrar catastrofe" on catastrofes for delete
  using (public.tiene_rol(array['admin']::rol_usuario[]));

-- (La lectura sigue abierta: la app necesita la lista para asignar sola.)

-- La catástrofe activa de Chile, para que los reportes de allá se asignen
-- solos. Si ya la creaste con otro nombre, esto no la duplica ni la pisa.
insert into catastrofes (nombre, pais, ciudad)
values ('Temporal de lluvias Chile', 'Chile', 'Coquimbo')
on conflict (nombre) do nothing;
