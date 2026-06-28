import { supabase } from './supabase'
import type { NecesidadTipo, NecesidadUrgencia } from './types'

export interface NuevoReporte {
  tipo: NecesidadTipo
  urgencia: NecesidadUrgencia
  descripcion: string
  zona?: string | null
  lat?: number | null
  lng?: number | null
  radio_km?: number | null // solo para zonas (tipo zona_sin_atender)
  origen?: string
  contacto?: string | null // se guarda en tabla privada aparte
}

/**
 * Inserta una necesidad y, si hay contacto, lo guarda en la tabla privada
 * `contactos_necesidad` (nunca expuesta al público).
 */
export async function crearNecesidad(r: NuevoReporte) {
  // Si quien reporta está autenticado, guardamos su id para habilitar el chat.
  const { data: auth } = await supabase.auth.getUser()
  const reportado_por = auth?.user?.id ?? null

  const { data, error } = await supabase
    .from('necesidades')
    .insert({
      tipo: r.tipo,
      urgencia: r.urgencia,
      descripcion: r.descripcion,
      texto_crudo: r.descripcion,
      zona: r.zona ?? null,
      lat: r.lat ?? null,
      lng: r.lng ?? null,
      radio_km: r.radio_km ?? null,
      origen: r.origen ?? 'web',
      estado: 'sin_verificar',
      reportado_por,
    })
    .select('id')
    .single()

  if (error) throw error

  if (r.contacto && data?.id) {
    const { error: e2 } = await supabase
      .from('contactos_necesidad')
      .insert({ necesidad_id: data.id, contacto: r.contacto })
    if (e2) console.error('No se pudo guardar el contacto:', e2.message)
  }

  return data
}
