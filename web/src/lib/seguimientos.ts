import { supabase } from './supabase'

/**
 * Bitácora de seguimiento por caso psicológico (migración 47). Privado: solo
 * el equipo de psicología y admin pueden leer/escribir (lo exige la RLS).
 */
export interface SeguimientoPsicologia {
  id: string
  necesidad_id: string
  autor: string | null
  nota: string
  proximo_contacto: string | null // fecha (YYYY-MM-DD)
  creado_en: string
}

export async function listarSeguimientos(
  necesidadId: string,
): Promise<SeguimientoPsicologia[]> {
  const { data, error } = await supabase
    .from('seguimientos_psicologia')
    .select('id, necesidad_id, autor, nota, proximo_contacto, creado_en')
    .eq('necesidad_id', necesidadId)
    .order('creado_en', { ascending: false })
  if (error) throw error
  return (data ?? []) as SeguimientoPsicologia[]
}

/**
 * Trae, para VARIOS casos a la vez, el seguimiento más reciente de cada uno
 * (para pintar el dashboard sin una consulta por tarjeta).
 */
export async function ultimosSeguimientos(
  necesidadIds: string[],
): Promise<Map<string, SeguimientoPsicologia>> {
  if (necesidadIds.length === 0) return new Map()
  const { data, error } = await supabase
    .from('seguimientos_psicologia')
    .select('id, necesidad_id, autor, nota, proximo_contacto, creado_en')
    .in('necesidad_id', necesidadIds)
    .order('creado_en', { ascending: false })
  if (error) throw error
  const ultimo = new Map<string, SeguimientoPsicologia>()
  for (const s of (data ?? []) as SeguimientoPsicologia[]) {
    if (!ultimo.has(s.necesidad_id)) ultimo.set(s.necesidad_id, s)
  }
  return ultimo
}

export async function crearSeguimiento(args: {
  necesidadId: string
  autor: string | null
  nota: string
  proximoContacto?: string | null
}): Promise<void> {
  const nota = args.nota.trim()
  if (!nota) throw new Error('Escribe una nota de seguimiento.')
  const { error } = await supabase.from('seguimientos_psicologia').insert({
    necesidad_id: args.necesidadId,
    autor: args.autor,
    nota,
    proximo_contacto: args.proximoContacto || null,
  })
  if (error) throw error
}
