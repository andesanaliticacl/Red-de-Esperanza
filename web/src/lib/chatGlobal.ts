import { supabase } from './supabase'
import type { MensajeGlobal } from './types'

/** Normaliza el nombre de la ciudad para agrupar las salas de chat. */
export function normalizarCiudad(ciudad: string): string {
  return ciudad.trim().toLowerCase()
}

/** Últimos mensajes del chat de una ciudad, en orden cronológico. */
export async function listarChat(
  ciudad: string,
  limite = 100,
): Promise<MensajeGlobal[]> {
  const { data, error } = await supabase
    .from('chat_global')
    .select('*')
    .eq('ciudad', normalizarCiudad(ciudad))
    .order('creado_en', { ascending: false })
    .limit(limite)
  if (error) throw error
  return ((data ?? []) as MensajeGlobal[]).reverse()
}

/** Envía un mensaje al chat de una ciudad. */
export async function enviarChat(args: {
  ciudad: string
  nombre: string
  cuerpo: string
}): Promise<void> {
  const { data: auth } = await supabase.auth.getUser()
  const { error } = await supabase.from('chat_global').insert({
    ciudad: normalizarCiudad(args.ciudad),
    nombre: args.nombre.trim().slice(0, 40),
    cuerpo: args.cuerpo.trim().slice(0, 500),
    autor: auth?.user?.id ?? null,
  })
  if (error) throw error
}

/**
 * Se suscribe en tiempo real a los mensajes nuevos de una ciudad.
 * Devuelve una función para cancelar la suscripción.
 */
export function suscribirChat(
  ciudad: string,
  alLlegar: (m: MensajeGlobal) => void,
): () => void {
  const sala = normalizarCiudad(ciudad)
  const canal = supabase
    .channel(`chat-global:${sala}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_global',
        filter: `ciudad=eq.${sala}`,
      },
      (payload) => alLlegar(payload.new as MensajeGlobal),
    )
    .subscribe()
  return () => {
    void supabase.removeChannel(canal)
  }
}
