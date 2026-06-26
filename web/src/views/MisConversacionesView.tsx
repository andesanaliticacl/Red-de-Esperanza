import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import ChatNecesidad from '../components/ChatNecesidad'
import { TIPO_META, type Mensaje, type NecesidadTipo } from '../lib/types'

interface OtroPerfil {
  id: string
  nombre: string | null
  foto_url: string | null
  ciudad: string | null
}
interface NecLite {
  id: string
  tipo: NecesidadTipo
  descripcion: string
  zona: string | null
}
interface Conversacion {
  nec: NecLite
  ultimo: Mensaje
  otro: OtroPerfil | null
}

/** Historial de chats: con quién hablaste, de qué ciudad y el último mensaje. */
export default function MisConversacionesView() {
  const { perfil } = useAuth()
  const [convs, setConvs] = useState<Conversacion[]>([])
  const [cargando, setCargando] = useState(true)
  const [chat, setChat] = useState<NecLite | null>(null)

  useEffect(() => {
    if (!perfil?.id) return
    const miId = perfil.id
    async function cargar() {
      // Necesidades donde participé: escribí un mensaje, o soy el reportante/asignado.
      const [mios, propias] = await Promise.all([
        supabase.from('mensajes').select('necesidad_id').eq('autor', miId),
        supabase
          .from('necesidades')
          .select('id')
          .or(`reportado_por.eq.${miId},asignado_a.eq.${miId}`),
      ])
      const ids = [
        ...new Set([
          ...(mios.data ?? []).map((m) => m.necesidad_id as string),
          ...(propias.data ?? []).map((n) => n.id as string),
        ]),
      ]
      if (ids.length === 0) {
        setConvs([])
        setCargando(false)
        return
      }

      const [necRes, msgRes] = await Promise.all([
        supabase
          .from('necesidades')
          .select('id, tipo, descripcion, zona, reportado_por, asignado_a')
          .in('id', ids),
        supabase
          .from('mensajes')
          .select('id, necesidad_id, autor, cuerpo, creado_en')
          .in('necesidad_id', ids)
          .order('creado_en', { ascending: true }),
      ])

      // Último mensaje y participantes por necesidad.
      const porNec = new Map<
        string,
        { ultimo: Mensaje; autores: Set<string> }
      >()
      for (const m of (msgRes.data ?? []) as Mensaje[]) {
        const e = porNec.get(m.necesidad_id)
        if (e) {
          e.ultimo = m
          e.autores.add(m.autor)
        } else {
          porNec.set(m.necesidad_id, { ultimo: m, autores: new Set([m.autor]) })
        }
      }

      type NecFull = NecLite & {
        reportado_por: string | null
        asignado_a: string | null
      }
      const necesidades = ((necRes.data ?? []) as NecFull[]).filter((n) =>
        porNec.has(n.id),
      )

      // "La otra persona" de cada conversación.
      const otroDe = new Map<string, string | null>()
      const otrosIds = new Set<string>()
      for (const n of necesidades) {
        const e = porNec.get(n.id)!
        const participantes = new Set<string>(e.autores)
        if (n.reportado_por) participantes.add(n.reportado_por)
        if (n.asignado_a) participantes.add(n.asignado_a)
        participantes.delete(miId)
        const otro =
          n.reportado_por && n.reportado_por !== miId
            ? n.reportado_por
            : ([...participantes][0] ?? null)
        otroDe.set(n.id, otro)
        if (otro) otrosIds.add(otro)
      }

      const perfRes = otrosIds.size
        ? await supabase
            .from('perfiles_publicos')
            .select('id, nombre, foto_url, ciudad')
            .in('id', [...otrosIds])
        : { data: [] as OtroPerfil[] }
      const mapaP = new Map(
        ((perfRes.data ?? []) as OtroPerfil[]).map((p) => [p.id, p]),
      )

      const lista: Conversacion[] = necesidades
        .map((n) => ({
          nec: {
            id: n.id,
            tipo: n.tipo,
            descripcion: n.descripcion,
            zona: n.zona,
          },
          ultimo: porNec.get(n.id)!.ultimo,
          otro: otroDe.get(n.id) ? mapaP.get(otroDe.get(n.id)!) ?? null : null,
        }))
        .sort(
          (a, b) =>
            new Date(b.ultimo.creado_en).getTime() -
            new Date(a.ultimo.creado_en).getTime(),
        )

      setConvs(lista)
      setCargando(false)
    }
    cargar()
  }, [perfil?.id])

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4">
      <h1 className="text-2xl font-extrabold text-bandera-azul">
        Mis conversaciones
      </h1>
      <p className="text-gray-600 text-sm">
        Tu historial de chats: con quién hablaste y el último mensaje.
      </p>

      {cargando ? (
        <div className="card text-center text-gray-500 py-8">Cargando…</div>
      ) : convs.length === 0 ? (
        <div className="card text-center text-gray-500 py-8">
          Todavía no tienes conversaciones.
          <Link to="/" className="block text-bandera-azul font-semibold mt-2">
            Ir al mapa →
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {convs.map((c) => (
            <button
              key={c.nec.id}
              onClick={() => setChat(c.nec)}
              className="card w-full flex items-center gap-3 text-left hover:shadow-lg transition"
            >
              <div className="h-12 w-12 rounded-full bg-bandera-azul/10 overflow-hidden flex items-center justify-center text-xl shrink-0">
                {c.otro?.foto_url ? (
                  <img
                    src={c.otro.foto_url}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span>👤</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-bold truncate">
                    {c.otro?.nombre ?? 'Usuario'}
                  </span>
                  {c.otro?.ciudad && (
                    <span className="text-xs text-gray-400 truncate">
                      📍 {c.otro.ciudad}
                    </span>
                  )}
                </div>
                <div className="text-xs text-gray-500">
                  {TIPO_META[c.nec.tipo].emoji} {TIPO_META[c.nec.tipo].etiqueta}
                </div>
                <div className="text-sm text-gray-700 truncate">
                  {c.ultimo.cuerpo}
                </div>
              </div>
              <div className="text-[11px] text-gray-400 whitespace-nowrap self-start">
                {new Date(c.ultimo.creado_en).toLocaleDateString('es-VE', {
                  day: '2-digit',
                  month: 'short',
                })}
              </div>
            </button>
          ))}
        </div>
      )}

      {chat && (
        <ChatNecesidad
          necesidadId={chat.id}
          titulo={`${TIPO_META[chat.tipo].etiqueta}${
            chat.zona ? ' · ' + chat.zona : ''
          }`}
          onCerrar={() => setChat(null)}
        />
      )}
    </div>
  )
}
