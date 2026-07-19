-- ============================================================
-- Red de Esperanza — Migración 47: Seguimiento de pacientes (psicología)
-- Ejecutar UNA vez DESPUÉS de 46, en: SQL Editor → New query → Run
--
-- Bitácora de seguimiento por caso psicológico: cada psicólogo/a puede
-- registrar sesiones o notas (fecha automática) y agendar el próximo
-- contacto, para no perder pacientes entre tantas solicitudes.
--
-- Privacidad: SOLO el equipo de psicología (psicologo, lider_psicologo)
-- y admin pueden ver o escribir seguimientos (usa es_equipo_psicologia()
-- de la migración 40). Nada de esto es público.
-- ============================================================

create table if not exists seguimientos_psicologia (
  id uuid primary key default gen_random_uuid(),
  necesidad_id uuid not null references necesidades(id) on delete cascade,
  autor uuid references perfiles(id) on delete set null,
  nota text not null check (char_length(nota) between 1 and 2000),
  -- Próxima fecha en que el equipo debe contactar al paciente (opcional).
  proximo_contacto date,
  creado_en timestamptz not null default now()
);

create index if not exists seguimientos_psico_necesidad_idx
  on seguimientos_psicologia (necesidad_id, creado_en desc);

alter table seguimientos_psicologia enable row level security;

drop policy if exists "ver seguimientos psicologia" on seguimientos_psicologia;
create policy "ver seguimientos psicologia" on seguimientos_psicologia
  for select using (public.es_equipo_psicologia());

drop policy if exists "crear seguimiento psicologia" on seguimientos_psicologia;
create policy "crear seguimiento psicologia" on seguimientos_psicologia
  for insert with check (
    public.es_equipo_psicologia() and autor = auth.uid()
  );
