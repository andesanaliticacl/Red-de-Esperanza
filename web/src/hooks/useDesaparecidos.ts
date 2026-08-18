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
  /** De qué país ES la persona (migración 81). Distinto de `pais`, que
   *  es dónde se perdió: un ecuatoriano puede perderse en Colombia. */
  nacionalidad: string | null
}

// Columnas justas para el mapa (sin traer de más).
const COLS_DESAP =
  'id, nombre, edad, genero, fecha_desaparicion, ultima_ubicacion, lat, lng, foto_url, contacto_familiar, estado, fuente, creado_en, pais, tipo_ser, id_fuente, nacionalidad'

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
export const POR_PAGINA = 1000

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
  // Página (0 = la primera). Como el servidor corta en 1.000 filas, la única
  // forma de llegar a los 6.379 de Caracas es ir de mil en mil. Sin esto, el
  // contador prometía un número al que no se podía llegar.
  pagina = 0,
  // Solo los que traen documento. No es un capricho de dato: que un reporte
  // tenga documento significa que se hizo con un papel oficial de por medio
  // y no solo con un nombre, así que es la parte de la lista más respaldada.
  soloConDocumento = false,
) {
  const [desaparecidos, setDesaparecidos] = useState<Desaparecido[]>([])
  const [total, setTotal] = useState<number | null>(null)
  // Cuántos hay DE VERDAD en el recuadro visible. Sin esto, el contador del
  // botón (que cuenta todo el país) no cuadraba con las burbujas del mapa, y
  // no había forma de saber si faltaban por el tope o porque no existen.
  const [totalZona, setTotalZona] = useState<number | null>(null)

  // Total para el contador del botón.
  //
  // Aplica TAMBIÉN "solo con documento". Sin eso, marcar ese filtro achicaba
  // la lista pero el número de arriba seguía contando a todos: el contador
  // prometía gente que la lista ya no mostraba, que es justo el descuadre
  // entre número y mapa que se venía arrastrando.
  useEffect(() => {
    let cancel = false
    let q = supabase
      .from('desaparecidos')
      .select('id', { count: 'exact', head: true })
      .eq('estado', 'no_encontrado')
      .not('lat', 'is', null)
    if (pais) q = q.eq('pais', pais)
    if (tipoSer) q = q.eq('tipo_ser', tipoSer)
    if (soloConDocumento) q = q.eq('tiene_documento', true)
    q.then(({ count }) => {
      if (!cancel) setTotal(count ?? null)
    })
    return () => {
      cancel = true
    }
  }, [pais, tipoSer, soloConDocumento])

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
      // El tipo va suelto A PROPÓSITO: cada `.eq()/.not()` encadenado suma
      // una capa al tipo inferido, y con tantos filtros TypeScript se rinde
      // ("type instantiation is excessively deep"). La seguridad se recupera
      // abajo, al convertir el resultado a Desaparecido[].
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q: any = supabase
        .from('desaparecidos')
        .select(COLS_DESAP, { count: 'exact' })
        .eq('estado', 'no_encontrado')
        .not('lat', 'is', null)
      if (pais) q = q.eq('pais', pais)
      if (tipoSer) q = q.eq('tipo_ser', tipoSer)
      // Se filtra por `tiene_documento` (verdadero/falso) y NO por la columna
      // `documento`: el número de documento dejó de ser legible para el
      // público en la migración 76, y filtrar por una columna sin permiso de
      // lectura falla. Además nunca hizo falta el número para esto: lo único
      // que importa es si el reporte se hizo con un papel oficial de por
      // medio o solo con un nombre.
      if (soloConDocumento) q = q.eq('tiene_documento', true)
      if (term) {
        q = q.ilike('nombre', `%${term}%`)
      } else if (zona) {
        q = q
          .gte('lat', zona.sur)
          .lte('lat', zona.norte)
          .gte('lng', zona.oeste)
          .lte('lng', zona.este)
      }
      // Orden ESTABLE: sin él, "página 2" puede repetir o saltarse gente,
      // porque Postgres no garantiza el mismo orden entre consultas.
      const desde = pagina * POR_PAGINA
      const { data, count } = await q
        .order('creado_en', { ascending: false })
        .order('id', { ascending: true })
        .range(desde, desde + POR_PAGINA - 1)
      if (cancel) return
      setDesaparecidos((data ?? []) as Desaparecido[])
      setTotalZona(count ?? null)
    })()
    return () => {
      cancel = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activo, term, zk, pais, tipoSer, pagina, soloConDocumento])

  const paginas =
    totalZona === null ? 1 : Math.max(1, Math.ceil(totalZona / POR_PAGINA))

  return {
    desaparecidos,
    /** Cuántos hay en el país (el número grande del botón). */
    total,
    /** Cuántos coinciden aquí (zona visible o búsqueda), sin el tope. */
    totalZona,
    /** Cuántas páginas hacen falta para verlos TODOS. */
    paginas,
    /** Posición del primero y del último que se está viendo (base 1), para
     *  poder decir "viendo 1.001–2.000 de 6.379". */
    desde: desaparecidos.length ? pagina * POR_PAGINA + 1 : 0,
    hasta: pagina * POR_PAGINA + desaparecidos.length,
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
