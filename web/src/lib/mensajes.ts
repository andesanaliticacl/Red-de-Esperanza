import { supabase } from './supabase'
import type { Mensaje } from './types'

/** Lista los mensajes de una necesidad, en orden cronológico. */
export async function listarMensajes(necesidadId: string): Promise<Mensaje[]> {
  const { data, error } = await supabase
    .from('mensajes')
    .select('*')
    .eq('necesidad_id', necesidadId)
    .order('creado_en', { ascending: true })
  if (error) throw error
  return (data ?? []) as Mensaje[]
}

/** Envía un mensaje en el chat de una necesidad (autor = usuario actual). */
export async function enviarMensaje(necesidadId: string, cuerpo: string) {
  const { data: auth } = await supabase.auth.getUser()
  const autor = auth?.user?.id
  if (!autor) throw new Error('Debes iniciar sesión para enviar mensajes.')
  const { error } = await supabase.from('mensajes').insert({
    necesidad_id: necesidadId,
    autor,
    cuerpo: cuerpo.trim(),
  })
  if (error) throw error
}

/**
 * Se suscribe en tiempo real a los mensajes nuevos de una necesidad.
 * Devuelve una función para cancelar la suscripción.
 */
export function suscribirMensajes(
  necesidadId: string,
  alLlegar: (m: Mensaje) => void,
): () => void {
  const canal = supabase
    .channel(`mensajes:${necesidadId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'mensajes',
        filter: `necesidad_id=eq.${necesidadId}`,
      },
      (payload) => alLlegar(payload.new as Mensaje),
    )
    .subscribe()
  return () => {
    void supabase.removeChannel(canal)
  }
}
