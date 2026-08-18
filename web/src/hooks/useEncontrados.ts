import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Desaparecido } from './useDesaparecidos'

/**
 * Personas y mascotas YA LOCALIZADAS.
 *
 * Va en un hook aparte y no dentro de `useDesaparecidos` por una razón de
 * fondo: los localizados NO TIENEN COORDENADAS. El scraper se las borra a
 * propósito al marcarlos como encontrados —junto con edad, género y última
 * ubicación— porque el origen deja de publicarlas, y mostrar más datos de una
 * persona encontrada que la propia fuente sería exponerla sin motivo.
 *
 * De ahí se sigue todo lo demás: no pueden dibujarse en el mapa aunque
 * quisiéramos, no tiene sentido filtrarlos por zona visible, y por eso este
 * hook es mucho más simple que el de desaparecidos. Son una LISTA.
 *
 * El contacto familiar SÍ se conserva, por decisión del equipo.
 *
 * No pisa a los desaparecidos: es una capa que se suma, no que reemplaza.
 */
const COLS =
  'id, nombre, fecha_desaparicion, foto_url, contacto_familiar, estado, fuente, creado_en, pais, tipo_ser, id_fuente, lat, lng, edad, genero, ultima_ubicacion, nacionalidad'

export function useEncontrados(
  activo: boolean,
  filtros: {
    busqueda?: string
    pais?: string | null
    tipoSer?: 'persona' | 'mascota' | null
  } = {},
) {
  const { busqueda = '', pais = null, tipoSer = null } = filtros
  const [encontrados, setEncontrados] = useState<Desaparecido[]>([])
  const [total, setTotal] = useState<number | null>(null)
  const [cargando, setCargando] = useState(false)

  useEffect(() => {
    if (!activo) {
      setEncontrados([])
      return
    }
    let cancelado = false
    setCargando(true)

    const term = busqueda.trim()
    let q = supabase
      .from('desaparecidos')
      .select(COLS, { count: 'exact' })
      .eq('estado', 'encontrado')
      // Los más recientes primero: una lista de localizados ordenada al revés
      // es un archivo muerto; así se ve que la cosa sigue pasando.
      .order('creado_en', { ascending: false })
      .limit(300)
    if (pais) q = q.eq('pais', pais)
    if (tipoSer) q = q.eq('tipo_ser', tipoSer)
    if (term) q = q.ilike('nombre', `%${term}%`)

    q.then(({ data, count, error }) => {
      if (cancelado) return
      if (error) {
        setEncontrados([])
        setTotal(null)
      } else {
        setEncontrados((data ?? []) as unknown as Desaparecido[])
        setTotal(count ?? null)
      }
      setCargando(false)
    })

    return () => {
      cancelado = true
    }
  }, [activo, busqueda, pais, tipoSer])

  return { encontrados, total, cargando }
}
