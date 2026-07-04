import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { nombresPublicos } from '../lib/perfiles'
import ChatNecesidad from '../components/ChatNecesidad'
import {
  TIPO_META,
  type Necesidad,
  type NecesidadEstado,
  type PerfilPublico,
} from '../lib/types'

const ESTADO_META: Record<NecesidadEstado, { etiqueta: string; clase: string }> = {
  sin_verificar: { etiqueta: '📩 Recibido', clase: 'bg-gray-100 text-gray-700' },
  verificada: { etiqueta: '📩 Recibido', clase: 'bg-gray-100 text-gray-700' },
  en_proceso: { etiqueta: '🔧 En proceso', clase: 'bg-blue-100 text-blue-700' },
  resuelta: { etiqueta: '✅ Atendido', clase: 'bg-green-100 text-green-700' },
  rechazada: { etiqueta: '✖️ Cerrado', clase: 'bg-red-100 text-red-700' },
}
const FECHA_MINIMA_VISIBLE = '2026-07-01T00:00:00.000Z'

/** Reportes que creó el usuario autenticado, con acceso al chat de cada uno. */
export default function MisReportesView() {
  const { perfil } = useAuth()
  const [lista, setLista] = useState<Necesidad[]>([])
  const [cargando, setCargando] = useState(true)
  const [chat, setChat] = useState<Necesidad | null>(null)
  const [nombres, setNombres] = useState<Map<string, PerfilPublico>>(new Map())
  const [borrando, setBorrando] = useState<string | null>(null)
  // Teléfono de quien atiende cada caso (id necesidad → teléfono | null).
  // Se obtiene con una función segura: solo el reportante del caso lo recibe.
  const [telAtiende, setTelAtiende] = useState<Map<string, string | null>>(
    new Map(),
  )

  async function cargarTelefonoAtiende(necesidadId: string) {
    const { data } = await supabase.rpc('telefono_de_quien_atiende', {
      p_necesidad_id: necesidadId,
    })
    setTelAtiende((prev) =>
      new Map(prev).set(necesidadId, (data as string | null) ?? null),
    )
  }

  async function borrar(n: Necesidad) {
    if (
      !confirm(
        '¿Eliminar este reporte? Se borrará para siempre, junto con su chat.',
      )
    )
      return
    setBorrando(n.id)
    const { error } = await supabase.from('necesidades').delete().eq('id', n.id)
    if (error) alert('No se pudo eliminar: ' + error.message)
    else setLista((prev) => prev.filter((x) => x.id !== n.id))
    setBorrando(null)
  }

  useEffect(() => {
    if (!perfil?.id) return
    supabase
      .from('necesidades')
      .select(
        'id, tipo, urgencia, estado, descripcion, zona, lat, lng, origen, reportado_por, asignado_a, creado_en',
      )
      .eq('reportado_por', perfil.id)
      .gte('creado_en', FECHA_MINIMA_VISIBLE)
      .order('creado_en', { ascending: false })
      .then(({ data }) => {
        const filas = (data ?? []) as Necesidad[]
        setLista(filas)
        setCargando(false)
        nombresPublicos(filas.map((n) => n.asignado_a)).then(setNombres)
        // Cargamos el teléfono de quien atiende los casos ya asignados.
        for (const n of filas) {
          if (n.asignado_a) void cargarTelefonoAtiende(n.id)
        }
      })
  }, [perfil?.id])

  // Notificación en vivo: cuando alguien se asigna a uno de mis reportes,
  // suena un aviso y se actualiza quién lo atiende.
  useEffect(() => {
    if (!perfil?.id) return
    const miId = perfil.id
    const canal = supabase
      .channel(`mis-reportes:${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'necesidades',
          filter: `reportado_por=eq.${miId}`,
        },
        (payload) => {
          const fila = payload.new as Necesidad
          setLista((prev) => {
            const anterior = prev.find((n) => n.id === fila.id)
            // Alguien acaba de asignarse → resolvemos su nombre para el badge
            // "Atiende: X". El aviso sonoro + toast lo da el proveedor global
            // de notificaciones (funciona en cualquier pantalla).
            if (fila.asignado_a && anterior && !anterior.asignado_a) {
              nombresPublicos([fila.asignado_a]).then((m) =>
                setNombres((prevN) => new Map([...prevN, ...m])),
              )
              void cargarTelefonoAtiende(fila.id)
            }
            return prev.map((n) => (n.id === fila.id ? { ...n, ...fila } : n))
          })
        },
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(canal)
    }
  }, [perfil?.id])

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4">
      <h1 className="text-2xl font-extrabold text-bandera-azul">Mis reportes</h1>
      <p className="text-gray-600 text-sm">
        Aquí ves los reportes que enviaste con tu cuenta y puedes comunicarte
        con quien te está ayudando.
      </p>

      {cargando ? (
        <div className="card text-center text-gray-500 py-8">Cargando…</div>
      ) : lista.length === 0 ? (
        <div className="card text-center text-gray-500 py-8">
          Todavía no has enviado reportes con tu cuenta.
          <Link to="/" className="block text-bandera-azul font-semibold mt-2">
            Ir al mapa para reportar →
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {lista.map((n) => (
            <div key={n.id} className="card flex items-center gap-3">
              <div className="text-3xl">{TIPO_META[n.tipo].emoji}</div>
              <div className="flex-1 min-w-0">
                <div className="font-bold">{TIPO_META[n.tipo].etiqueta}</div>
                <div className="text-sm text-gray-700 truncate">
                  {n.descripcion}
                </div>
                <span
                  className={`inline-block mt-1 text-xs px-2 py-0.5 rounded-full ${
                    ESTADO_META[n.estado].clase
                  }`}
                >
                  {ESTADO_META[n.estado].etiqueta}
                </span>
                {n.asignado_a &&
                  (n.estado === 'en_proceso' || n.estado === 'resuelta') && (
                    <div className="mt-1 space-y-1">
                      <div className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-50 px-2 py-1 rounded-lg">
                        🤝 Atiende:{' '}
                        {nombres.get(n.asignado_a)?.nombre ?? 'Voluntario'}
                      </div>
                      {telAtiende.get(n.id) && (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-xs text-gray-600">
                            📞 {telAtiende.get(n.id)}
                          </span>
                          <a
                            href={`tel:${(telAtiende.get(n.id) as string).replace(/[^\d+]/g, '')}`}
                            className="inline-flex items-center bg-bandera-azul !text-white font-semibold px-2.5 py-1 rounded-lg no-underline text-xs"
                          >
                            Llamar
                          </a>
                          <a
                            href={`https://wa.me/${(telAtiende.get(n.id) as string).replace(/\D/g, '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center bg-green-600 !text-white font-semibold px-2.5 py-1 rounded-lg no-underline text-xs"
                          >
                            WhatsApp
                          </a>
                        </div>
                      )}
                    </div>
                  )}
              </div>
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => setChat(n)}
                  className="btn-azul py-2.5 px-4 whitespace-nowrap"
                >
                  💬 Contactar
                </button>
                <button
                  onClick={() => borrar(n)}
                  disabled={borrando === n.id}
                  className="py-2.5 px-4 whitespace-nowrap rounded-2xl font-bold border-2 border-bandera-rojo text-bandera-rojo disabled:opacity-60"
                >
                  🗑️ Eliminar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {chat && (
        <ChatNecesidad
          necesidadId={chat.id}
          titulo={TIPO_META[chat.tipo].etiqueta}
          onCerrar={() => setChat(null)}
        />
      )}
    </div>
  )
}
