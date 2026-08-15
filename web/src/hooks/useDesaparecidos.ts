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
  /** País del registro (migración 58). Hasta ahora TODO es del terremoto de
   *  Venezuela 2026; se agrega para cuando otras catástrofes sumen las suyas. */
  pais: string | null
  /** 'persona' o 'mascota' (migración 60), para poder filtrar el mapa. */
  tipo_ser: 'persona' | 'mascota' | null
  /** Id en el sitio de origen, para los importados (ej. "ctb:<uuid>").
   *  Permite enlazar a la publicación original. Null en los de la app. */
  id_fuente: string | null
}

// Columnas justas para el mapa (sin traer de más).
const COLS_DESAP =
  'id, nombre, edad, genero, fecha_desaparicion, ultima_ubicacion, lat, lng, foto_url, contacto_familiar, estado, fuente, creado_en, pais, tipo_ser, id_fuente'

// Topes de cuántos marcadores se traen, puestos en 1000 porque ES EL MÁXIMO
// QUE DEVUELVE EL SERVIDOR: Supabase (PostgREST) corta toda respuesta en 1000
// filas (`db-max-rows`), así que pedir 3000 u 8000 devuelve 1000 igual.
// Medido contra la base: pedir 1500 → llegan 1000; pedir 8000 → llegan 1000.
//
// Para pasar de 1000 hay que PAGINAR (varias vueltas con .range()). Cuesta
// ~93 KB comprimidos por cada 1000 con todas las columnas, así que Venezuela
// entera (13.684) serían ~1,3 MB y 14 viajes: mucho para un teléfono con
// mala señal en plena emergencia. Por eso se muestran los de la zona visible
// y se avisa cuántos faltan, en vez de descargarlo todo.
const LIMITE_BUSQUEDA = 1000
const LIMITE_ZONA = 1000
const LIMITE_SIN_ZONA = 1000

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
  // Hasta ahora todo el dataset es de Venezuela (terremoto 2026); cuando
  // otras catástrofes sumen registros, este filtro evita mezclar países en
  // el mapa. null = todos.
  pais: string | null = null,
  // 'persona' | 'mascota' | null (todos). Para distinguir de un vistazo qué
  // se está buscando: los reportes de mascota no son personas desaparecidas.
  tipoSer: 'persona' | 'mascota' | null = null,
) {
  const [desaparecidos, setDesaparecidos] = useState<Desaparecido[]>([])
  const [total, setTotal] = useState<number | null>(null)
  // Cuántos hay DE VERDAD en el recuadro visible. Sin esto, el contador del
  // botón (que cuenta todo el país) no cuadraba con las burbujas del mapa, y
  // no había forma de saber si faltaban por el tope o porque no existen.
  const [totalZona, setTotalZona] = useState<number | null>(null)

  // Total (una sola vez POR PAÍS + TIPO) para el contador del botón.
  useEffect(() => {
    let cancel = false
    let q = supabase
      .from('desaparecidos')
      .select('id', { count: 'exact', head: true })
      .eq('estado', 'no_encontrado')
      .not('lat', 'is', null)
    if (pais) q = q.eq('pais', pais)
    if (tipoSer) q = q.eq('tipo_ser', tipoSer)
    q.then(({ count }) => {
      if (!cancel) setTotal(count ?? null)
    })
    return () => {
      cancel = true
    }
  }, [pais, tipoSer])

  const term = busqueda.trim()
  const zk = zona
    ? `${zona.norte.toFixed(3)}|${zona.sur.toFixed(3)}|${zona.este.toFixed(3)}|${zona.oeste.toFixed(3)}`
    : ''

  useEffect(() => {
    if (!activo) {
      setDesaparecidos([])
      setTotalZona(null)
      return
    }
    let cancel = false
    ;(async () => {
      // UNA sola consulta con `count: 'exact'`: devuelve las filas ya
      // limitadas Y cuántas coinciden en total. Antes eran dos consultas
      // escritas por separado —una para el contador, otra para el mapa— y
      // por eso decían cosas distintas. Con una sola no pueden desalinearse.
      let q = supabase
        .from('desaparecidos')
        .select(COLS_DESAP, { count: 'exact' })
        .eq('estado', 'no_encontrado')
        .not('lat', 'is', null)
      if (pais) q = q.eq('pais', pais)
      if (tipoSer) q = q.eq('tipo_ser', tipoSer)
      if (term) {
        q = q.ilike('nombre', `%${term}%`).limit(LIMITE_BUSQUEDA)
      } else if (zona) {
        q = q
          .gte('lat', zona.sur)
          .lte('lat', zona.norte)
          .gte('lng', zona.oeste)
          .lte('lng', zona.este)
          .limit(LIMITE_ZONA)
      } else {
        q = q.limit(LIMITE_SIN_ZONA)
      }
      const { data, count } = await q
      if (cancel) return
      setDesaparecidos((data ?? []) as Desaparecido[])
      setTotalZona(count ?? null)
    })()
    return () => {
      cancel = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activo, term, zk, pais, tipoSer])

  return {
    desaparecidos,
    /** Cuántos hay en el país (el número grande del botón). */
    total,
    /** Cuántos hay en el recuadro visible. Con esto se puede decir "viendo
     *  800 de 3.400 aquí" en vez de mostrar un número que no cuadra. */
    totalZona,
    /** Se llegó al tope: hay más de los que se pintaron. */
    limitado:
      totalZona !== null && desaparecidos.length > 0
        ? totalZona > desaparecidos.length
        : false,
  }
}

export function useDesaparecidos() {
  const [desaparecidos, setDesaparecidos] = useState<Desaparecido[]>([])
  const [cargando, setCargando] = useState(true)

  async function cargar() {
    const { data, error } = await supabase
      .from('desaparecidos')
      .select('id, nombre, edad, genero, fecha_desaparicion, ultima_ubicacion, lat, lng, foto_url, contacto_familiar, estado, fuente, creado_en')
      .order('creado_en', { ascending: false })
      .limit(1000) // panel admin: no descargar las 66k de golpe
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
