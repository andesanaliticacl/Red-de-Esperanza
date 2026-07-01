import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import {
  TIPO_META,
  ROL_META,
  type NecesidadTipo,
  type RolUsuario,
} from '../lib/types'

interface NotaRow {
  id: string
  necesidad_id: string
  autor: string | null
  nota: string
  creado_en: string
}
interface NecLite {
  id: string
  tipo: NecesidadTipo
  descripcion: string
  zona: string | null
  lat: number | null
  lng: number | null
}
interface PerfilLite {
  id: string
  nombre: string | null
  rol: RolUsuario | null
}

const FMT: Intl.DateTimeFormatOptions = {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
}

/**
 * Todas las notas de cierre que ha dejado el equipo al cerrar casos. La ven el
 * admin y los líderes de voluntarios (la RLS deja leerlas a todo el personal).
 * Para cada nota se muestra quién la escribió (con su rol), el caso al que
 * pertenece y un enlace para verlo en el mapa.
 */
export default function NotasCierreView() {
  const [notas, setNotas] = useState<NotaRow[]>([])
  const [necs, setNecs] = useState<Map<string, NecLite>>(new Map())
  const [perfiles, setPerfiles] = useState<Map<string, PerfilLite>>(new Map())
  const [cargando, setCargando] = useState(true)
  const [busqueda, setBusqueda] = useState('')

  useEffect(() => {
    async function cargar() {
      const { data } = await supabase
        .from('notas_cierre')
        .select('id, necesidad_id, autor, nota, creado_en')
        .order('creado_en', { ascending: false })
        .limit(2000)
      const filas = (data ?? []) as NotaRow[]
      setNotas(filas)

      const necIds = [...new Set(filas.map((n) => n.necesidad_id))]
      const autorIds = [
        ...new Set(filas.map((n) => n.autor).filter((a): a is string => !!a)),
      ]

      const [necRes, perfRes] = await Promise.all([
        necIds.length
          ? supabase
              .from('necesidades')
              .select('id, tipo, descripcion, zona, lat, lng')
              .in('id', necIds)
          : Promise.resolve({ data: [] }),
        autorIds.length
          ? supabase
              .from('perfiles_publicos')
              .select('id, nombre, rol')
              .in('id', autorIds)
          : Promise.resolve({ data: [] }),
      ])
      setNecs(
        new Map(((necRes.data ?? []) as NecLite[]).map((n) => [n.id, n])),
      )
      setPerfiles(
        new Map(((perfRes.data ?? []) as PerfilLite[]).map((p) => [p.id, p])),
      )
      setCargando(false)
    }
    cargar()
  }, [])

  const nombreDe = (id: string | null) =>
    (id && perfiles.get(id)?.nombre) || 'Usuario'
  const rolDe = (id: string | null) => {
    const r = id ? perfiles.get(id)?.rol : null
    return r ? ROL_META[r] : null
  }

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return notas
    return notas.filter((n) => {
      const nec = necs.get(n.necesidad_id)
      return (
        n.nota.toLowerCase().includes(q) ||
        nombreDe(n.autor).toLowerCase().includes(q) ||
        (nec?.descripcion ?? '').toLowerCase().includes(q) ||
        (nec?.zona ?? '').toLowerCase().includes(q)
      )
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notas, necs, perfiles, busqueda])

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4">
      <h1 className="text-2xl font-extrabold text-bandera-azul">
        Notas de cierre
      </h1>
      <p className="text-gray-600 text-sm">
        Todos los comentarios que el equipo ha dejado al cerrar casos. Cada nota
        indica quién la escribió y a qué necesidad pertenece.
      </p>

      <input
        type="search"
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        placeholder="🔎 Buscar por persona, caso o texto…"
        className="input"
      />

      {cargando ? (
        <div className="card text-center text-gray-500 py-8">Cargando…</div>
      ) : filtradas.length === 0 ? (
        <div className="card text-center text-gray-500 py-8">
          {notas.length === 0
            ? 'Todavía no hay notas de cierre.'
            : 'Sin resultados para esa búsqueda.'}
        </div>
      ) : (
        <>
          <div className="text-xs text-gray-400">
            {filtradas.length} nota(s)
          </div>
          <div className="space-y-2">
            {filtradas.map((n) => {
              const nec = necs.get(n.necesidad_id)
              const meta = rolDe(n.autor)
              const tipo = nec?.tipo ?? 'otro'
              return (
                <div key={n.id} className="card">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xl">{TIPO_META[tipo].emoji}</span>
                    <span className="font-bold flex-1 min-w-0 truncate">
                      {TIPO_META[tipo].etiqueta}
                      {nec?.zona ? ` · ${nec.zona}` : ''}
                    </span>
                    <span className="text-[11px] text-gray-400 whitespace-nowrap">
                      {new Date(n.creado_en).toLocaleString('es-VE', FMT)}
                    </span>
                  </div>

                  {nec?.descripcion && (
                    <div className="text-xs text-gray-500 mt-0.5 break-words">
                      {nec.descripcion}
                    </div>
                  )}

                  <div className="mt-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-900 whitespace-pre-wrap break-words">
                    📝 {n.nota}
                  </div>

                  <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-gray-700">
                      {nombreDe(n.autor)}
                    </span>
                    {meta && (
                      <span className="text-[10px] bg-gray-100 px-1.5 py-0.5 rounded-full">
                        {meta.emoji} {meta.etiqueta}
                      </span>
                    )}
                    {nec && nec.lat != null && nec.lng != null && (
                      <Link
                        to={`/?necesidad=${n.necesidad_id}`}
                        className="ml-auto text-xs font-semibold text-bandera-azul no-underline"
                      >
                        🗺️ Ver en el mapa
                      </Link>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      <Link
        to="/"
        className="block text-center text-bandera-azul font-semibold text-sm"
      >
        ← Volver al mapa
      </Link>
    </div>
  )
}
