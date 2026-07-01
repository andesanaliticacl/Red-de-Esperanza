import { supabase } from './supabase'

export interface ContactoNecesidad {
  contacto: string
  pais_origen: string | null
  ciudad_origen: string | null
}

/**
 * Trae TODOS los contactos de necesidades (teléfono + país/ciudad de origen),
 * paginando para saltar el tope de 1000 filas de la API. Solo el personal puede
 * leerlos (RLS); cualquier otro recibe un mapa vacío. Devuelve necesidad_id → …
 *
 * Antes se pedían con una sola consulta (máx. 1000): con más solicitudes, las
 * que quedaban fuera se veían como "sin teléfono" aunque sí lo tuvieran.
 */
export async function cargarContactosNecesidad(): Promise<
  Map<string, ContactoNecesidad>
> {
  const TAM = 1000
  const m = new Map<string, ContactoNecesidad>()
  for (let desde = 0; ; desde += TAM) {
    const { data, error } = await supabase
      .from('contactos_necesidad')
      .select('necesidad_id, contacto, pais_origen, ciudad_origen')
      .range(desde, desde + TAM - 1)
    if (error || !data) break
    const lote = data as {
      necesidad_id: string
      contacto: string
      pais_origen: string | null
      ciudad_origen: string | null
    }[]
    for (const c of lote) {
      m.set(c.necesidad_id, {
        contacto: c.contacto,
        pais_origen: c.pais_origen,
        ciudad_origen: c.ciudad_origen,
      })
    }
    if (lote.length < TAM) break
  }
  return m
}
