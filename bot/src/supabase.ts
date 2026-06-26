import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_KEY

if (!url || !key) {
  throw new Error(
    'Faltan SUPABASE_URL o SUPABASE_SERVICE_KEY. Revisa tu .env / variables en Render.',
  )
}

// El bot usa la service_role key → salta RLS para insertar reportes.
export const supabase = createClient(url, key, {
  auth: { persistSession: false },
})

export type NecesidadTipo =
  | 'rescate'
  | 'agua_comida'
  | 'medicinas'
  | 'refugio'
  | 'otro'
export type Urgencia = 'alta' | 'media' | 'baja'

export interface Extraccion {
  tipo: NecesidadTipo
  urgencia: Urgencia
  zona: string
  descripcion: string
}

/** Inserta un reporte de Telegram y devuelve su id. */
export async function insertarNecesidad(
  e: Extraccion,
  textoCrudo: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('necesidades')
    .insert({
      tipo: e.tipo,
      urgencia: e.urgencia,
      zona: e.zona || null,
      descripcion: e.descripcion || textoCrudo,
      texto_crudo: textoCrudo,
      origen: 'telegram',
      estado: 'sin_verificar',
    })
    .select('id')
    .single()

  if (error) {
    console.error('Error insertando necesidad:', error.message)
    return null
  }
  return data?.id ?? null
}

/** Actualiza lat/lng del último reporte de Telegram (por id recordado). */
export async function actualizarUbicacion(
  id: string,
  lat: number,
  lng: number,
): Promise<void> {
  const { error } = await supabase
    .from('necesidades')
    .update({ lat, lng })
    .eq('id', id)
  if (error) console.error('Error actualizando ubicación:', error.message)
}
