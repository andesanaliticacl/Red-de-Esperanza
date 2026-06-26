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

/** Reportes que creó el usuario autenticado, con acceso al chat de cada uno. */
export default function MisReportesView() {
  const { perfil } = useAuth()
  const [lista, setLista] = useState<Necesidad[]>([])
  const [cargando, setCargando] = useState(true)
  const [chat, setChat] = useState<Necesidad | null>(null)
  const [nombres, setNombres] = useState<Map<string, PerfilPublico>>(new Map())

  useEffect(() => {
    if (!perfil?.id) return
    supabase
      .from('necesidades')
      .select(
        'id, tipo, urgencia, estado, descripcion, zona, lat, lng, origen, reportado_por, asignado_a, creado_en',
      )
      .eq('reportado_por', perfil.id)
      .order('creado_en', { ascending: false })
      .then(({ data }) => {
        const filas = (data ?? []) as Necesidad[]
        setLista(filas)
        setCargando(false)
        nombresPublicos(filas.map((n) => n.asignado_a)).then(setNombres)
      })
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
                    <div className="text-xs font-semibold text-bandera-azul mt-1">
                      🤝 Atiende: {nombres.get(n.asignado_a)?.nombre ?? 'Voluntario'}
                    </div>
                  )}
              </div>
              <button
                onClick={() => setChat(n)}
                className="btn-azul py-2.5 px-4 whitespace-nowrap"
              >
                💬 Mensajes
              </button>
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
