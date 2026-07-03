import { supabase } from './supabase'
import { paisPorIP } from './visitas'
import type { NecesidadTipo, NecesidadUrgencia } from './types'

// Máximo de solicitudes por día con el mismo teléfono (se bloquea la 4.ª).
const LIMITE_POR_TELEFONO_DIA = 3

/** Origen (país/ciudad por IP) con un tope de espera para no frenar el reporte. */
async function origenConTimeout(
  ms = 2500,
): Promise<{ pais: string | null; ciudad: string | null }> {
  return Promise.race([
    paisPorIP(),
    new Promise<{ pais: null; ciudad: null }>((resolve) =>
      setTimeout(() => resolve({ pais: null, ciudad: null }), ms),
    ),
  ])
}

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
  // Anti-spam: una persona no puede crear más de LIMITE_POR_TELEFONO_DIA
  // solicitudes al día con el MISMO teléfono. Se valida ANTES de crear nada.
  if (r.contacto && r.contactoObligatorio) {
    const { data: n } = await supabase.rpc('reportes_hoy_por_telefono', {
      p_tel: r.contacto,
    })
    if ((n ?? 0) >= LIMITE_POR_TELEFONO_DIA) {
      throw new Error(
        `Ya registraste ${LIMITE_POR_TELEFONO_DIA} solicitudes hoy con este número de teléfono. Por seguridad no se permiten más por hoy; si es una nueva emergencia, contacta a un voluntario o llama al 911.`,
      )
    }
  }

  // Origen (país/ciudad por IP) de quien crea la solicitud, en paralelo.
  const origenPromesa = r.contacto ? origenConTimeout() : null

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
    const origen = (await origenPromesa) ?? { pais: null, ciudad: null }
    // Reintentamos un par de veces por si hay un fallo de red puntual.
    let errContacto = null
    for (let intento = 0; intento < 3; intento++) {
      const res = await supabase.from('contactos_necesidad').insert({
        necesidad_id: data.id,
        contacto: r.contacto,
        pais_origen: origen.pais,
        ciudad_origen: origen.ciudad,
      })
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

/**
 * Quita (o restaura) una necesidad/SOS del mapa. Borrado suave: la fila sigue en
 * la base con `eliminada_del_mapa` para dejar registro de qué se eliminó, quién y
 * cuándo. La función SQL valida que solo un líder de voluntarios o un admin pueda
 * hacerlo (la RLS deja a cualquier voluntario actualizar, así que el permiso fino
 * vive en el servidor). Pasa `eliminar=false` para restaurarla al mapa.
 */
export async function eliminarDelMapa(
  id: string,
  eliminar = true,
  motivo?: string,
) {
  const { error } = await supabase.rpc('eliminar_necesidad_del_mapa', {
    p_id: id,
    p_eliminar: eliminar,
    p_motivo: motivo ?? null,
  })
  if (error) throw error
}

/** Cambia solo el tipo de una necesidad. El servidor valida que sea admin. */
export async function cambiarTipoNecesidad(id: string, tipo: NecesidadTipo) {
  const { error } = await supabase.rpc('cambiar_tipo_necesidad', {
    p_id: id,
    p_tipo: tipo,
  })
  if (error) throw error
}
