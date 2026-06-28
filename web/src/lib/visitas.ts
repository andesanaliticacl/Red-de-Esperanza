import { supabase } from './supabase'

// Registro ANÓNIMO de visitantes para el contador del panel de administración.
// Cada navegador genera un id propio (guardado en localStorage) y se registra
// UNA fila por dispositivo (con su país aproximado por IP). Repetir la visita
// solo actualiza la fecha, no crea duplicados.

const CLAVE_ID = 'esperanza.visitorId'
const CLAVE_HOY = 'esperanza.visitaHoy'

function idVisitante(): string {
  let id = localStorage.getItem(CLAVE_ID)
  if (!id) {
    id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `v_${Date.now()}_${Math.random().toString(36).slice(2)}`
    localStorage.setItem(CLAVE_ID, id)
  }
  return id
}

/** País y ciudad aproximados por IP (sin clave). Null si no se puede. */
async function paisPorIP(): Promise<{ pais: string | null; ciudad: string | null }> {
  try {
    const r = await fetch('https://ipwho.is/')
    const j = await r.json()
    if (j?.success) {
      return { pais: j.country ?? null, ciudad: j.city ?? null }
    }
  } catch {
    /* sin red o bloqueado */
  }
  return { pais: null, ciudad: null }
}

/**
 * Registra (o actualiza) la visita del dispositivo actual. Se llama una vez al
 * cargar la app. No bloquea ni molesta al usuario si falla.
 */
export async function registrarVisita(): Promise<void> {
  try {
    // Como mucho, una escritura por día y dispositivo (evita tráfico inútil).
    const hoy = new Date().toISOString().slice(0, 10)
    if (localStorage.getItem(CLAVE_HOY) === hoy) return

    const id = idVisitante()
    const { pais, ciudad } = await paisPorIP()
    const { error } = await supabase.from('visitas').upsert(
      {
        visitor_id: id,
        pais,
        ciudad,
        visto_en: new Date().toISOString(),
      },
      { onConflict: 'visitor_id' },
    )
    if (!error) localStorage.setItem(CLAVE_HOY, hoy)
  } catch {
    /* silencioso: el contador no debe afectar la experiencia */
  }
}
