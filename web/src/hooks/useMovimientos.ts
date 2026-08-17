import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { TIPO_META, type NecesidadTipo } from '../lib/types'
import { OFERTA_META, type OfertaTipo } from '../lib/ofertas'

/**
 * Registro de movimientos EN VIVO: lo último que va pasando en la red.
 *
 * Trae las últimas al abrir y desde ahí sigue en vivo, escuchando las altas
 * de `necesidades` y de `ofertas` por Realtime.
 *
 * La primera versión NO cargaba nada al abrir, para no aparentar actividad
 * reciente que no hubo. El problema práctico fue el contrario: si nadie
 * reporta nada en los minutos que tienes la página abierta, la tira está
 * siempre vacía y no se entiende para qué existe.
 *
 * Se resuelve con la HORA REAL en vez de escondiendo el pasado: cada línea
 * dice "hace 3h" o "hace 2d" según su `creado_en` de verdad, así que nada
 * aparenta ser más reciente de lo que es.
 */
export interface Movimiento {
  id: string
  clase: 'necesidad' | 'oferta'
  emoji: string
  etiqueta: string
  zona: string | null
  lat: number | null
  lng: number | null
  en: number
}

// Pocos y recientes: es un vistazo, no una bandeja de entrada.
const MAXIMO = 12

/** Cuántas se traen al abrir, antes de que empiece lo que pasa en vivo. */
const INICIALES = 5

export function useMovimientos(activo = true) {
  const [movimientos, setMovimientos] = useState<Movimiento[]>([])

  useEffect(() => {
    if (!activo) return

    const sufijo = Math.random().toString(36).slice(2)
    let cancelado = false

    const agregar = (m: Movimiento) =>
      setMovimientos((prev) =>
        prev.some((x) => x.id === m.id)
          ? prev
          : [m, ...prev].sort((a, b) => b.en - a.en).slice(0, MAXIMO),
      )

    // Carga inicial: las últimas de cada tabla, mezcladas por fecha real.
    void (async () => {
      const [nec, ofe] = await Promise.all([
        supabase
          .from('necesidades')
          .select('id, tipo, zona, lat, lng, creado_en')
          .eq('eliminada_del_mapa', false)
          .order('creado_en', { ascending: false })
          .limit(INICIALES),
        supabase
          .from('ofertas')
          .select('id, tipo, zona, lat, lng, creado_en')
          .eq('estado', 'disponible')
          .order('creado_en', { ascending: false })
          .limit(INICIALES),
      ])
      if (cancelado) return

      const previos: Movimiento[] = []
      for (const n of nec.data ?? []) {
        const meta = TIPO_META[n.tipo as NecesidadTipo]
        if (!meta) continue
        previos.push({
          id: n.id,
          clase: 'necesidad',
          emoji: meta.emoji,
          etiqueta: meta.etiqueta,
          zona: n.zona,
          lat: n.lat,
          lng: n.lng,
          en: Date.parse(n.creado_en),
        })
      }
      for (const o of ofe.data ?? []) {
        const meta = OFERTA_META[o.tipo as OfertaTipo]
        if (!meta) continue
        previos.push({
          id: o.id,
          clase: 'oferta',
          emoji: meta.emoji,
          etiqueta: meta.etiqueta,
          zona: o.zona,
          lat: o.lat,
          lng: o.lng,
          en: Date.parse(o.creado_en),
        })
      }

      setMovimientos((prev) => {
        // Lo que ya llegó en vivo mientras cargaba esto manda: es más nuevo.
        const ids = new Set(prev.map((x) => x.id))
        return [...prev, ...previos.filter((p) => !ids.has(p.id))]
          .sort((a, b) => b.en - a.en)
          .slice(0, MAXIMO)
      })
    })()

    const canalNec = supabase
      .channel(`mov-necesidades:${sufijo}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'necesidades' },
        (payload) => {
          const n = payload.new as {
            id: string
            tipo: NecesidadTipo
            zona: string | null
            lat: number | null
            lng: number | null
            creado_en?: string
            eliminada_del_mapa?: boolean
          }
          if (n.eliminada_del_mapa) return
          const meta = TIPO_META[n.tipo]
          if (!meta) return
          agregar({
            id: n.id,
            clase: 'necesidad',
            emoji: meta.emoji,
            etiqueta: meta.etiqueta,
            zona: n.zona,
            lat: n.lat,
            lng: n.lng,
            // Hora REAL del registro, no la de llegada del aviso.
            en: n.creado_en ? Date.parse(n.creado_en) : Date.now(),
          })
        },
      )
      .subscribe()

    const canalOf = supabase
      .channel(`mov-ofertas:${sufijo}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'ofertas' },
        (payload) => {
          const o = payload.new as {
            id: string
            tipo: OfertaTipo
            zona: string | null
            lat: number | null
            lng: number | null
            creado_en?: string
          }
          const meta = OFERTA_META[o.tipo]
          if (!meta) return
          agregar({
            id: o.id,
            clase: 'oferta',
            emoji: meta.emoji,
            etiqueta: meta.etiqueta,
            zona: o.zona,
            lat: o.lat,
            lng: o.lng,
            en: o.creado_en ? Date.parse(o.creado_en) : Date.now(),
          })
        },
      )
      .subscribe()

    return () => {
      cancelado = true
      supabase.removeChannel(canalNec)
      supabase.removeChannel(canalOf)
    }
  }, [activo])

  return movimientos
}
