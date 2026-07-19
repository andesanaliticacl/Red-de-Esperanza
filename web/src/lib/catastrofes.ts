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
  creado_en: string
}

/** Lista todas las catástrofes, la más reciente primero. */
export async function listarCatastrofes(): Promise<Catastrofe[]> {
  const { data, error } = await supabase
    .from('catastrofes')
    .select('id, nombre, pais, creado_en')
    .order('creado_en', { ascending: false })
    .limit(100)
  if (error) throw error
  return (data ?? []) as Catastrofe[]
}

/**
 * Crea una catástrofe nueva. Solo usuarios con cuenta (lo exige la RLS);
 * la fecha de creación la pone la base automáticamente.
 */
export async function crearCatastrofe(
  nombre: string,
  pais?: string | null,
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
    .insert({ nombre: limpio, pais: pais?.trim() || null, creado_por: auth.user.id })
    .select('id, nombre, pais, creado_en')
    .single()
  if (error) {
    if (error.code === '23505') {
      throw new Error('Ya existe una catástrofe con ese nombre.')
    }
    throw error
  }
  return data as Catastrofe
}
