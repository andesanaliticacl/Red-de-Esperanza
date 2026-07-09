-- ============================================================
-- Red de Esperanza - Fix 43
-- Permite que el rol acopio_admin tambien registre centros
-- de acopio desde el mismo formulario que centro_acopio.
-- ============================================================

drop policy if exists "crear acopio" on centros_acopio;

create policy "crear acopio" on centros_acopio for insert with check (
  public.tiene_rol(
    array[
      'admin',
      'centro_acopio',
      'acopio_admin',
      'lider_voluntarios',
      'lider_psicologo'
    ]::rol_usuario[]
  )
);
