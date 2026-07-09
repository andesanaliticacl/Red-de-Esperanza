-- ============================================================
-- Red de Esperanza - Fix 42
-- Temporalmente impide que una persona se registre a si misma
-- como psicologo desde el cliente. El rol puede seguir siendo
-- asignado por administradores desde las herramientas internas.
-- ============================================================

drop policy if exists "crear mi perfil" on perfiles;

create policy "crear mi perfil" on perfiles for insert
  with check (
    auth.uid() = id
    and rol::text in (
      'ciudadano',
      'voluntario',
      'rescatista',
      'centro_acopio'
    )
  );
