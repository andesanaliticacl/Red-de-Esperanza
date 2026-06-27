import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export interface Desaparecido {
  id: string
  nombre: string
  edad: number | null
  genero: string | null
  fecha_desaparicion: string | null
  ultima_ubicacion: string | null
  lat: number | null
  lng: number | null
  foto_url: string | null
  contacto_familiar: string | null
  estado: 'no_encontrado' | 'encontrado'
  fuente: string | null
  creado_en: string
}

// Columnas justas para el mapa (sin traer de más).
const COLS_DESAP =
  'id, nombre, edad, genero, fecha_desaparicion, ultima_ubicacion, lat, lng, foto_url, contacto_familiar, estado, fuente, creado_en'

export interface ZonaMapa {
  norte: number
  sur: number
  este: number
  oeste: number
}

/**
 * Carga desaparecidos para el MAPA, optimizado para mucha gente a la vez:
 *  - Solo carga cuando la capa está ACTIVA (la mayoría nunca la abre → 0 tráfico).
 *  - Solo trae los de la ZONA visible (bounding box) con un tope, no los 66k.
 *  - Si hay búsqueda por nombre, busca en toda la base (ilike) con tope.
 *  - SIN realtime: los desaparecidos casi no cambian; se evita una conexión
 *    websocket por visitante (clave para escalar a miles).
 */
export function useDesaparecidosMapa(
  activo: boolean,
  zona: ZonaMapa | null,
  busqueda: string,
) {
  const [desaparecidos, setDesaparecidos] = useState<Desaparecido[]>([])
  const [total, setTotal] = useState<number | null>(null)

  // Total (una sola vez) para el contador del botón. Consulta barata (head).
  useEffect(() => {
    let cancel = false
    supabase
      .from('desaparecidos')
      .select('id', { count: 'exact', head: true })
      .not('lat', 'is', null)
      .then(({ count }) => {
        if (!cancel) setTotal(count ?? null)
      })
    return () => {
      cancel = true
    }
  }, [])

  const term = busqueda.trim()
  const zk = zona
    ? `${zona.norte.toFixed(3)}|${zona.sur.toFixed(3)}|${zona.este.toFixed(3)}|${zona.oeste.toFixed(3)}`
    : ''

  useEffect(() => {
    if (!activo) {
      setDesaparecidos([])
      return
    }
    let cancel = false
    ;(async () => {
      let q = supabase.from('desaparecidos').select(COLS_DESAP).not('lat', 'is', null)
      if (term) {
        q = q.ilike('nombre', `%${term}%`).limit(300)
      } else if (zona) {
        q = q
          .gte('lat', zona.sur)
          .lte('lat', zona.norte)
          .gte('lng', zona.oeste)
          .lte('lng', zona.este)
          .limit(1500)
      } else {
        q = q.limit(800)
      }
      const { data } = await q
      if (!cancel) setDesaparecidos((data ?? []) as Desaparecido[])
    })()
    return () => {
      cancel = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activo, term, zk])

  return { desaparecidos, total }
}

export function useDesaparecidos() {
  const [desaparecidos, setDesaparecidos] = useState<Desaparecido[]>([])
  const [cargando, setCargando] = useState(true)

  async function cargar() {
    const { data, error } = await supabase
      .from('desaparecidos')
      .select('id, nombre, edad, genero, fecha_desaparicion, ultima_ubicacion, lat, lng, foto_url, contacto_familiar, estado, fuente, creado_en')
      .order('creado_en', { ascending: false })
    if (!error) setDesaparecidos((data ?? []) as Desaparecido[])
    setCargando(false)
  }

  useEffect(() => {
    cargar()
    const canal = supabase
      .channel(`desaparecidos:${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'desaparecidos' },
        (payload) => {
          if (payload.eventType === 'UPDATE') {
            setDesaparecidos(prev =>
              prev.map(d => d.id === (payload.new as Desaparecido).id
                ? { ...d, ...(payload.new as Desaparecido) }
                : d
              )
            )
          }
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(canal) }
  }, [])

  return { desaparecidos, cargando, recargar: cargar }
}