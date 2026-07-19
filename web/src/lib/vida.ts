import { supabase } from './supabase'
import type { NecesidadTipo } from './types'

/**
 * Ciclo de vida de 4 días (migración 46): las publicaciones se OCULTAN (no se
 * borran) si nadie las refresca en 4 días. Cualquier persona puede refrescar
 * y el contador SIEMPRE vuelve a 4 días completos.
 *
 * No vencen: derrumbes, atención psicológica (tiene su propio ciclo con el
 * equipo) y hospitales (es_hospital en centros_acopio).
 */
export const VIDA_DIAS = 4
export const VIDA_MS = VIDA_DIAS * 24 * 60 * 60 * 1000

export const TIPOS_SIN_VENCIMIENTO: NecesidadTipo[] = [
  'derrumbe',
  'atencion_psicologica',
]

/** Fecha ISO límite: lo refrescado antes de esto ya venció. */
export function fechaCorteVida(): string {
  return new Date(Date.now() - VIDA_MS).toISOString()
}

/** Milisegundos que le quedan de vida (0 si venció; null si nunca vence). */
export function vidaRestanteMs(item: {
  tipo?: NecesidadTipo
  es_hospital?: boolean | null
  ultimo_refresco?: string | null
  creado_en: string
}): number | null {
  if (item.tipo && TIPOS_SIN_VENCIMIENTO.includes(item.tipo)) return null
  if (item.es_hospital) return null
  const base = item.ultimo_refresco ?? item.creado_en
  const restante = +new Date(base) + VIDA_MS - Date.now()
  return Math.max(0, restante)
}

export function estaVencida(item: {
  tipo?: NecesidadTipo
  es_hospital?: boolean | null
  ultimo_refresco?: string | null
  creado_en: string
}): boolean {
  const ms = vidaRestanteMs(item)
  return ms !== null && ms <= 0
}

/** Texto corto del contador: "3d 14h", "9 h", "45 min". */
export function textoVidaRestante(ms: number): string {
  const horas = Math.floor(ms / 3_600_000)
  if (horas >= 24) return `${Math.floor(horas / 24)}d ${horas % 24}h`
  if (horas >= 1) return `${horas} h`
  return `${Math.max(1, Math.floor(ms / 60_000))} min`
}

/** Renueva una necesidad: el contador vuelve a 4 días completos. */
export async function refrescarNecesidad(id: string): Promise<void> {
  const { error } = await supabase.rpc('refrescar_necesidad', { p_id: id })
  if (error) throw error
}

/** Renueva un centro de acopio: el contador vuelve a 4 días completos. */
export async function refrescarCentro(id: string): Promise<void> {
  const { error } = await supabase.rpc('refrescar_centro', { p_id: id })
  if (error) throw error
}
