import { supabase } from './supabase'

/**
 * Catástrofes (eventos de emergencia con nombre): "Terremoto Venezuela",
 * "Temporal de lluvias Chile"... Los reportes pueden etiquetarse con una
 * (opcional) para poder filtrar por emergencia a futuro.
 *
 * OJO: la tabla es `catastrofes` — `eventos` ya existe y es la bitácora
 * interna de actividad del staff (no tocar).
 */
export interface Catastrofe {
  id: string
  nombre: string
  pais: string | null
  /** Ciudad/zona de la emergencia (migración 57). Afina la asignación
   *  automática cuando hay varias catástrofes en un mismo país. */
  ciudad: string | null
  creado_en: string
}

/** Lista todas las catástrofes, la más reciente primero. */
export async function listarCatastrofes(): Promise<Catastrofe[]> {
  const { data, error } = await supabase
    .from('catastrofes')
    .select('id, nombre, pais, ciudad, creado_en')
    .order('creado_en', { ascending: false })
    .limit(100)
  if (error) throw error
  return (data ?? []) as Catastrofe[]
}

/**
 * Crea una catástrofe nueva. Desde la migración 57 solo la coordinación
 * (admin y líderes) puede hacerlo, y se define desde el panel: así los
 * reportes se asignan solos y nadie tiene que elegir un evento a mano.
 */
export async function crearCatastrofe(
  nombre: string,
  pais?: string | null,
  ciudad?: string | null,
): Promise<Catastrofe> {
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user?.id) {
    throw new Error('Debes iniciar sesión para crear una catástrofe.')
  }
  const limpio = nombre.trim()
  if (limpio.length < 3) {
    throw new Error('El nombre de la catástrofe es muy corto.')
  }
  const { data, error } = await supabase
    .from('catastrofes')
    .insert({
      nombre: limpio,
      pais: pais?.trim() || null,
      ciudad: ciudad?.trim() || null,
      creado_por: auth.user.id,
    })
    .select('id, nombre, pais, ciudad, creado_en')
    .single()
  if (error) {
    if (error.code === '23505') {
      throw new Error('Ya existe una catástrofe con ese nombre.')
    }
    if (error.code === '42501') {
      throw new Error(
        'Solo el equipo de coordinación (admin o líder) puede crear catástrofes.',
      )
    }
    throw error
  }
  return data as Catastrofe
}
