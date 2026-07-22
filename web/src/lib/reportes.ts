import { supabase } from './supabase'
import { paisPorIP } from './visitas'
import type { NecesidadTipo, NecesidadUrgencia } from './types'
import { encolarReporte, reportesEnCola, quitarDeCola } from './colaOffline'

// Máximo de solicitudes por día con el mismo teléfono (se bloquea la 4.ª).
const LIMITE_POR_TELEFONO_DIA = 3

function crearIdReporte() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()

  const bytes = new Uint8Array(16)
  globalThis.crypto.getRandomValues(bytes)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0'))
  return [
    hex.slice(0, 4).join(''),
    hex.slice(4, 6).join(''),
    hex.slice(6, 8).join(''),
    hex.slice(8, 10).join(''),
    hex.slice(10, 16).join(''),
  ].join('-')
}

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
  /** Catástrofe (evento) a la que pertenece el reporte. Opcional. */
  catastrofe_id?: string | null
  origen?: string
  contacto?: string | null // se guarda en tabla privada aparte
  // Cuando true (SOS y reportes normales), el teléfono DEBE guardarse: si su
  // guardado falla, se aborta con error en vez de dejar la solicitud sin forma
  // de contacto. Sin él, nadie puede contactar a quien pide ayuda.
  contactoObligatorio?: boolean
}

export interface ResultadoReporte {
  /** Id de la necesidad (se genera en el cliente, exista o no conexión). */
  id: string
  /** true si NO había Internet: quedó en cola y se enviará al reconectar. */
  offline?: boolean
}

/** ¿El error viene de falta de red (y no de un rechazo del servidor)? */
function esErrorDeRed(e: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  const m = ((e as Error)?.message ?? '').toLowerCase()
  return (
    m.includes('failed to fetch') ||
    m.includes('networkerror') ||
    m.includes('load failed') ||
    m.includes('fetch')
  )
}

/**
 * Inserta la necesidad (con el id dado) y, si hay contacto, lo guarda en la tabla
 * privada `contactos_necesidad`. No valida el límite diario (eso es solo para el
 * alta directa con conexión). Lanza si algo falla (red o servidor).
 *
 * El contacto vive aparte por privacidad (Realtime entrega la fila completa de
 * `necesidades`). Cuando es obligatorio, garantizamos que se guarde: reintentamos
 * y, si aun así falla, borramos la necesidad para no dejar una solicitud sin número.
 */
async function insertarReporteEnServidor(
  id: string,
  r: NuevoReporte,
): Promise<void> {
  const origenPromesa = r.contacto ? origenConTimeout() : null

  // Si quien reporta está autenticado, guardamos su id para habilitar el chat.
  const { data: auth } = await supabase.auth.getUser()
  const reportado_por = auth?.user?.id ?? null

  const { error } = await supabase.from('necesidades').insert({
    id,
    tipo: r.tipo,
    urgencia: r.urgencia,
    descripcion: r.descripcion,
    texto_crudo: r.descripcion,
    zona: r.zona ?? null,
    lat: r.lat ?? null,
    lng: r.lng ?? null,
    radio_km: r.radio_km ?? null,
    catastrofe_id: r.catastrofe_id ?? null,
    origen: r.origen ?? 'web',
    estado: 'sin_verificar',
    reportado_por,
  })

  if (error) throw error

  if (r.contacto) {
    const origen = (await origenPromesa) ?? { pais: null, ciudad: null }
    let errContacto = null
    for (let intento = 0; intento < 3; intento++) {
      const res = await supabase.from('contactos_necesidad').insert({
        necesidad_id: id,
        contacto: r.contacto,
        pais_origen: origen.pais,
        ciudad_origen: origen.ciudad,
      })
      errContacto = res.error
      if (!errContacto) break
    }
    if (errContacto) {
      if (r.contactoObligatorio) {
        await supabase.from('necesidades').delete().eq('id', id)
        throw new Error(
          'No pudimos guardar tu número de teléfono. Revisa tu conexión e inténtalo de nuevo: es obligatorio para que puedan contactarte.',
        )
      }
      console.error('No se pudo guardar el contacto:', errContacto.message)
    }
  }
}

/**
 * Crea una necesidad. Si NO hay Internet, la guarda en una cola local (en el
 * teléfono) y se enviará sola al recuperar la conexión: así se puede reportar
 * offline. Con conexión, valida el límite diario por teléfono e inserta.
 */
export async function crearNecesidad(
  r: NuevoReporte,
): Promise<ResultadoReporte> {
  const id = crearIdReporte()

  // Sin Internet: a la cola y salimos. El sincronizador la vaciará al reconectar.
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    encolarReporte(id, r)
    return { id, offline: true }
  }

  // Anti-spam (solo con conexión): máx. LIMITE por día con el MISMO teléfono.
  if (r.contacto && r.contactoObligatorio) {
    const { data: n, error } = await supabase.rpc('reportes_hoy_por_telefono', {
      p_tel: r.contacto,
    })
    if (!error && (n ?? 0) >= LIMITE_POR_TELEFONO_DIA) {
      throw new Error(
        `Ya registraste ${LIMITE_POR_TELEFONO_DIA} solicitudes hoy con este número de teléfono. Por seguridad no se permiten más por hoy; si es una nueva emergencia, contacta a un voluntario o llama al 911.`,
      )
    }
  }

  try {
    await insertarReporteEnServidor(id, r)
    return { id }
  } catch (e) {
    // Si se cayó la red a mitad, no perdemos el reporte: va a la cola.
    if (esErrorDeRed(e)) {
      encolarReporte(id, r)
      return { id, offline: true }
    }
    throw e
  }
}

/**
 * Reintenta enviar los reportes que quedaron en cola sin Internet. Devuelve
 * cuántos se enviaron. Se llama al recuperar la conexión y al abrir la app.
 */
export async function sincronizarCola(): Promise<number> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 0
  let enviados = 0
  for (const item of reportesEnCola()) {
    try {
      await insertarReporteEnServidor(item.id, item.reporte)
      quitarDeCola(item.id)
      enviados++
    } catch (e) {
      // Sigue sin red: paramos y reintentamos más tarde (no perdemos nada).
      if (esErrorDeRed(e)) break
      // Rechazo del servidor (p. ej. validación): lo quitamos para no repetir.
      quitarDeCola(item.id)
    }
  }
  return enviados
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
