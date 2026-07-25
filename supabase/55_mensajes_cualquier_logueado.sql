-- Cualquier persona con sesión iniciada puede comentar (y leer) el chat de
-- una necesidad, no solo el personal interno o quien la reportó/atiende.
-- Antes daba "new row violates row-level security policy for table
-- mensajes" al intentar responder una alerta ajena estando logueado.
--
-- La atención psicológica (tipo 'atencion_psicologica') mantiene su
-- protección: por privacidad, sigue restringida al equipo de psicología y a
-- quien reportó/atiende el caso.

drop policy if exists "leer mensajes" on mensajes;
create policy "leer mensajes" on mensajes for select using (
  exists (
    select 1
    from necesidades n
    where n.id = mensajes.necesidad_id
      and (
        (n.tipo::text <> 'atencion_psicologica' and auth.uid() is not null)
        or (
          n.tipo::text = 'atencion_psicologica'
          and (
            public.es_equipo_psicologia()
            or n.reportado_por = auth.uid()
            or n.asignado_a = auth.uid()
          )
        )
      )
  )
);

drop policy if exists "crear mensajes" on mensajes;
create policy "crear mensajes" on mensajes for insert with check (
  autor = auth.uid()
  and exists (
    select 1
    from necesidades n
    where n.id = mensajes.necesidad_id
      and (
        (n.tipo::text <> 'atencion_psicologica' and auth.uid() is not null)
        or (
          n.tipo::text = 'atencion_psicologica'
          and (
            public.es_equipo_psicologia()
            or n.reportado_por = auth.uid()
            or n.asignado_a = auth.uid()
          )
        )
      )
  )
);
