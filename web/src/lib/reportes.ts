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
  // Cuando true (SOS y reportes normales), el teléfono DEBE guardarse: si su
  // guardado falla, se aborta con error en vez de dejar la solicitud sin forma
  // de contacto. Sin él, nadie puede contactar a quien pide ayuda.
  contactoObligatorio?: boolean
}

/**
 * Inserta una necesidad y, si hay contacto, lo guarda en la tabla privada
 * `contactos_necesidad` (nunca expuesta al público).
 *
 * El contacto vive en una tabla aparte por privacidad (Realtime entrega la fila
 * completa de `necesidades`, así que el teléfono no puede vivir ahí). Cuando es
 * obligatorio, garantizamos que se guarde: reintentamos y, si aun así falla,
 * borramos la necesidad recién creada y lanzamos error, para que nunca quede una
 * solicitud "fantasma" sin número (era el caso del SOS sin teléfono).
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
    // Reintentamos un par de veces por si hay un fallo de red puntual.
    let errContacto = null
    for (let intento = 0; intento < 3; intento++) {
      const res = await supabase
        .from('contactos_necesidad')
        .insert({ necesidad_id: data.id, contacto: r.contacto })
      errContacto = res.error
      if (!errContacto) break
    }
    if (errContacto) {
      if (r.contactoObligatorio) {
        // No dejamos una solicitud sin teléfono: deshacemos lo creado y avisamos.
        await supabase.from('necesidades').delete().eq('id', data.id)
        throw new Error(
          'No pudimos guardar tu número de teléfono. Revisa tu conexión e inténtalo de nuevo: es obligatorio para que puedan contactarte.',
        )
      }
      console.error('No se pudo guardar el contacto:', errContacto.message)
    }
  }

  return data
}
