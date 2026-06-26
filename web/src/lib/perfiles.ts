import { supabase } from './supabase'
import type { PerfilPublico } from './types'

/**
 * Resuelve nombres públicos (id → nombre/rol) usando la vista `perfiles_publicos`.
 * Sirve para mostrar "atendido por …" sin exponer datos sensibles.
 */
export async function nombresPublicos(
  ids: (string | null | undefined)[],
): Promise<Map<string, PerfilPublico>> {
  const limpios = [...new Set(ids.filter((x): x is string => Boolean(x)))]
  const mapa = new Map<string, PerfilPublico>()
  if (limpios.length === 0) return mapa
  const { data, error } = await supabase
    .from('perfiles_publicos')
    .select('id, nombre, rol')
    .in('id', limpios)
  if (error) return mapa
  for (const p of (data ?? []) as PerfilPublico[]) mapa.set(p.id, p)
  return mapa
}
