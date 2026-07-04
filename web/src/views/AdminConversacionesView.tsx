import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  TIPO_META,
  ROL_META,
  type Mensaje,
  type NecesidadTipo,
  type RolUsuario,
} from '../lib/types'

interface PerfilLite {
  id: string
  nombre: string | null
  rol: RolUsuario | null
}
interface NecLite {
  id: string
  tipo: NecesidadTipo
  descripcion: string
  zona: string | null
}
interface Conversacion {
  nec: NecLite
  mensajes: Mensaje[]
  ultimo: Mensaje
  participantes: string[]
}

// Mensajes a traer como máximo (la retención es de 3 días, así que el volumen
// real es acotado). Suficiente para monitorear todas las conversaciones vivas.
const LIMITE_MENSAJES = 5000
const FECHA_MINIMA_VISIBLE = '2026-07-01T00:00:00.000Z'

/**
 * Monitoreo de TODAS las conversaciones (solo admin). Lista cada chat por
 * necesidad —con sus participantes y el último mensaje— y permite abrir el hilo
 * completo en modo solo lectura. Aprovecha que la RLS deja al admin leer todos
 * los mensajes; no expone nada nuevo a otros roles.
 */
export default function AdminConversacionesView() {
  const [convs, setConvs] = useState<Conversacion[]>([])
  const [perfiles, setPerfiles] = useState<Map<string, PerfilLite>>(new Map())
  const [cargando, setCargando] = useState(true)
  const [abierta, setAbierta] = useState<Conversacion | null>(null)
  const [busqueda, setBusqueda] = useState('')

  useEffect(() => {
    async function cargar() {
      // 1) Todos los mensajes (orden cronológico).
      const msgRes = await supabase
        .from('mensajes')
        .select('id, necesidad_id, autor, cuerpo, creado_en')
        .order('creado_en', { ascending: true })
        .limit(LIMITE_MENSAJES)
      const mensajes = (msgRes.data ?? []) as Mensaje[]

      // 2) Agrupar por necesidad: hilo, último mensaje y participantes (autores).
      const porNec = new Map<
        string,
        { mensajes: Mensaje[]; autores: Set<string> }
      >()
      for (const m of mensajes) {
        const e = porNec.get(m.necesidad_id)
        if (e) {
          e.mensajes.push(m)
          e.autores.add(m.autor)
        } else {
          porNec.set(m.necesidad_id, {
            mensajes: [m],
            autores: new Set([m.autor]),
          })
        }
      }
      const ids = [...porNec.keys()]
      if (ids.length === 0) {
        setConvs([])
        setCargando(false)
        return
      }

      // 3) Datos de las necesidades y de todos los participantes.
      const [necRes, perfRes] = await Promise.all([
        supabase
          .from('necesidades')
          .select('id, tipo, descripcion, zona, reportado_por, asignado_a')
          .gte('creado_en', FECHA_MINIMA_VISIBLE)
          .in('id', ids),
        // (los autores se completan abajo con los reportantes/asignados)
        Promise.resolve(null),
      ])

      type NecFull = NecLite & {
        reportado_por: string | null
        asignado_a: string | null
      }
      const necs = (necRes.data ?? []) as NecFull[]
      const mapaNec = new Map(necs.map((n) => [n.id, n]))

      // Junta TODOS los ids de personas involucradas (autores + reportante + asignado).
      const personaIds = new Set<string>()
      for (const [necId, e] of porNec) {
        e.autores.forEach((a) => personaIds.add(a))
        const n = mapaNec.get(necId)
        if (n?.reportado_por) personaIds.add(n.reportado_por)
        if (n?.asignado_a) personaIds.add(n.asignado_a)
      }
      void perfRes
      const perfData = personaIds.size
        ? await supabase
            .from('perfiles_publicos')
            .select('id, nombre, rol')
            .in('id', [...personaIds])
        : { data: [] as PerfilLite[] }
      const mapaPerf = new Map(
        ((perfData.data ?? []) as PerfilLite[]).map((p) => [p.id, p]),
      )
      setPerfiles(mapaPerf)

      // 4) Armar la lista de conversaciones (solo las que tienen mensajes).
      const lista: Conversacion[] = ids
        .filter((id) => mapaNec.has(id))
        .map((id) => {
          const e = porNec.get(id)!
          const n = mapaNec.get(id)
          const participantes = new Set<string>(e.autores)
          if (n?.reportado_por) participantes.add(n.reportado_por)
          if (n?.asignado_a) participantes.add(n.asignado_a)
          return {
            nec: {
              id,
              tipo: (n?.tipo ?? 'otro') as NecesidadTipo,
              descripcion: n?.descripcion ?? '(necesidad eliminada)',
              zona: n?.zona ?? null,
            },
            mensajes: e.mensajes,
            ultimo: e.mensajes[e.mensajes.length - 1],
            participantes: [...participantes],
          }
        })
        .sort(
          (a, b) =>
            new Date(b.ultimo.creado_en).getTime() -
            new Date(a.ultimo.creado_en).getTime(),
        )

      setConvs(lista)
      setCargando(false)
    }
    cargar()
  }, [])

  const nombreDe = (id: string) =>
    perfiles.get(id)?.nombre ?? 'Usuario'
  const rolDe = (id: string) => {
    const r = perfiles.get(id)?.rol
    return r ? ROL_META[r] : null
  }

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return convs
    return convs.filter((c) => {
      const enParticipantes = c.participantes.some((p) =>
        nombreDe(p).toLowerCase().includes(q),
      )
      const enTexto =
        c.nec.descripcion.toLowerCase().includes(q) ||
        (c.nec.zona ?? '').toLowerCase().includes(q) ||
        c.ultimo.cuerpo.toLowerCase().includes(q)
      return enParticipantes || enTexto
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convs, busqueda, perfiles])

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4">
      <h1 className="text-2xl font-extrabold text-bandera-azul">
        Todas las conversaciones
      </h1>
      <p className="text-gray-600 text-sm">
        Monitoreo de todos los chats entre quienes reportan y quienes atienden.
        Solo lectura. Visible únicamente para administradores.
      </p>

      <input
        type="search"
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        placeholder="🔎 Buscar por persona, necesidad o texto…"
        className="input"
      />

      {cargando ? (
        <div className="card text-center text-gray-500 py-8">Cargando…</div>
      ) : filtradas.length === 0 ? (
        <div className="card text-center text-gray-500 py-8">
          {convs.length === 0
            ? 'Todavía no hay conversaciones.'
            : 'Sin resultados para esa búsqueda.'}
        </div>
      ) : (
        <>
          <div className="text-xs text-gray-400">
            {filtradas.length} conversación(es)
          </div>
          <div className="space-y-2">
            {filtradas.map((c) => (
              <button
                key={c.nec.id}
                onClick={() => setAbierta(c)}
                className="card w-full text-left hover:shadow-lg transition"
              >
                <div className="flex items-center gap-2">
                  <span className="text-xl">{TIPO_META[c.nec.tipo].emoji}</span>
                  <span className="font-bold truncate flex-1">
                    {TIPO_META[c.nec.tipo].etiqueta}
                    {c.nec.zona ? ` · ${c.nec.zona}` : ''}
                  </span>
                  <span className="text-[11px] text-gray-400 whitespace-nowrap">
                    {new Date(c.ultimo.creado_en).toLocaleString('es-VE', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
                <div className="text-xs text-gray-500 mt-0.5 truncate">
                  👥{' '}
                  {c.participantes
                    .map((p) => nombreDe(p))
                    .join(', ')}{' '}
                  · {c.mensajes.length} mensaje(s)
                </div>
                <div className="text-sm text-gray-700 truncate mt-0.5">
                  <span className="font-semibold">{nombreDe(c.ultimo.autor)}:</span>{' '}
                  {c.ultimo.cuerpo}
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      {abierta && (
        <HiloModal
          conv={abierta}
          nombreDe={nombreDe}
          rolDe={rolDe}
          onCerrar={() => setAbierta(null)}
        />
      )}
    </div>
  )
}

/** Hilo completo de una conversación, en solo lectura. */
function HiloModal({
  conv,
  nombreDe,
  rolDe,
  onCerrar,
}: {
  conv: Conversacion
  nombreDe: (id: string) => string
  rolDe: (id: string) => { etiqueta: string; emoji: string } | null
  onCerrar: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-[2600] bg-black/50 flex items-stretch sm:items-center justify-center sm:p-4"
      onClick={onCerrar}
    >
      <div
        className="bg-white w-full sm:max-w-md h-full sm:h-[80vh] sm:rounded-3xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-2 px-4 py-3 border-b">
          <div className="min-w-0 flex-1">
            <div className="font-bold leading-tight">
              {TIPO_META[conv.nec.tipo].emoji} {TIPO_META[conv.nec.tipo].etiqueta}
              {conv.nec.zona ? ` · ${conv.nec.zona}` : ''}
            </div>
            <div className="text-xs text-gray-500 truncate">
              {conv.nec.descripcion}
            </div>
          </div>
          <button
            onClick={onCerrar}
            className="text-2xl text-gray-400 leading-none"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-gray-50">
          {conv.mensajes.map((m) => {
            const meta = rolDe(m.autor)
            return (
              <div key={m.id} className="bg-white rounded-xl px-3 py-2 shadow-sm">
                <div className="flex items-center gap-2 text-xs text-gray-500 mb-0.5">
                  <span className="font-semibold text-gray-700">
                    {nombreDe(m.autor)}
                  </span>
                  {meta && (
                    <span className="text-[10px] bg-gray-100 px-1.5 py-0.5 rounded-full">
                      {meta.emoji} {meta.etiqueta}
                    </span>
                  )}
                  <span className="ml-auto whitespace-nowrap">
                    {new Date(m.creado_en).toLocaleString('es-VE', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
                <div className="text-sm text-gray-800 whitespace-pre-wrap break-words">
                  {m.cuerpo}
                </div>
              </div>
            )
          })}
        </div>

        <div className="px-4 py-2 border-t text-center text-xs text-gray-400">
          Vista de solo lectura (monitoreo)
        </div>
      </div>
    </div>
  )
}
