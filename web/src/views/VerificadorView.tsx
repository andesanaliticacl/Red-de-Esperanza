import { useMemo, useState } from 'react'
import { MapContainer, TileLayer, Marker } from 'react-leaflet'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useNecesidades } from '../hooks/useNecesidades'
import ChatNecesidad from '../components/ChatNecesidad'
import { iconoNecesidad } from '../lib/iconos'
import { distanciaMetros, enlaceComoLlegar } from '../lib/geo'
import {
  TIPO_META,
  URGENCIA_META,
  type Necesidad,
  type NecesidadTipo,
  type NecesidadUrgencia,
} from '../lib/types'

const TIPOS: NecesidadTipo[] = [
  'rescate',
  'atencion_psicologica',
  'zona_sin_atender',
  'agua_comida',
  'medicinas',
  'refugio',
  'derrumbe',
  'inundacion',
  'incendio',
  'sacos_arena',
  'otro',
]
const URGENCIAS: NecesidadUrgencia[] = ['alta', 'media', 'baja']

function gravedad(n: Necesidad): number {
  // rescate primero; dentro, por urgencia; luego por antigüedad (más viejo primero)
  const t = n.tipo === 'rescate' ? 0 : 1
  return t * 10 + URGENCIA_META[n.urgencia].orden
}

export default function VerificadorView() {
  const { perfil } = useAuth()
  const { necesidades, recargar } = useNecesidades(['sin_verificar'])

  const cola = useMemo(
    () =>
      [...necesidades].sort((a, b) => {
        const g = gravedad(a) - gravedad(b)
        if (g !== 0) return g
        return +new Date(a.creado_en) - +new Date(b.creado_en)
      }),
    [necesidades],
  )

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold text-bandera-azul">
          Cola de verificación
        </h1>
        <p className="text-gray-600">
          {cola.length} reporte{cola.length === 1 ? '' : 's'} esperando. Rescate
          primero.
        </p>
      </div>

      {cola.length === 0 && (
        <div className="card text-center text-gray-500 py-10">
          🎉 No hay nada pendiente por verificar.
        </div>
      )}

      {cola.map((n) => (
        <TarjetaVerificacion
          key={n.id}
          n={n}
          todas={necesidades}
          verificadorId={perfil?.id ?? null}
          onResuelta={recargar}
        />
      ))}
    </div>
  )
}

function TarjetaVerificacion({
  n,
  todas,
  verificadorId,
  onResuelta,
}: {
  n: Necesidad
  todas: Necesidad[]
  verificadorId: string | null
  onResuelta: () => void
}) {
  const [editando, setEditando] = useState(false)
  const [tipo, setTipo] = useState<NecesidadTipo>(n.tipo)
  const [urgencia, setUrgencia] = useState<NecesidadUrgencia>(n.urgencia)
  const [zona, setZona] = useState(n.zona ?? '')
  const [trabajando, setTrabajando] = useState(false)
  const [verDuplicados, setVerDuplicados] = useState(false)
  const [abrirChat, setAbrirChat] = useState(false)

  // Posibles duplicados: dentro de ~200 m y 2 h.
  const duplicados = useMemo(() => {
    if (n.lat == null || n.lng == null) return []
    const limite = 2 * 60 * 60 * 1000
    return todas.filter(
      (o) =>
        o.id !== n.id &&
        o.lat != null &&
        o.lng != null &&
        Math.abs(+new Date(o.creado_en) - +new Date(n.creado_en)) < limite &&
        distanciaMetros(n.lat!, n.lng!, o.lat, o.lng) <= 200,
    )
  }, [n, todas])

  async function confirmar(conCorreccion: boolean) {
    setTrabajando(true)
    const patch: Partial<Necesidad> = {
      estado: 'verificada',
      verificada_por: verificadorId,
    }
    if (conCorreccion) {
      patch.tipo = tipo
      patch.urgencia = urgencia
      patch.zona = zona.trim() || null
    }
    const { error } = await supabase
      .from('necesidades')
      .update(patch)
      .eq('id', n.id)
    if (error) {
      alert('Error: ' + error.message)
      setTrabajando(false)
    } else {
      onResuelta()
    }
  }

  async function rechazar() {
    if (!confirm('¿Rechazar este reporte? Se archivará y no se publicará.'))
      return
    setTrabajando(true)
    const { error } = await supabase
      .from('necesidades')
      .update({ estado: 'rechazada' })
      .eq('id', n.id)
    if (error) {
      alert('Error: ' + error.message)
      setTrabajando(false)
    } else onResuelta()
  }

  return (
    <div className="card space-y-3 border-l-4" style={{ borderLeftColor: TIPO_META[n.tipo].color }}>
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm text-gray-500">
          {n.origen === 'sos' ? '🆘 SOS' : '🌐 Web'} ·{' '}
          {new Date(n.creado_en).toLocaleString('es-VE')}
        </div>
        {n.tipo === 'rescate' && (
          <span className="bg-bandera-rojo text-white text-xs font-bold px-2 py-1 rounded">
            RESCATE
          </span>
        )}
      </div>

      {/* Texto original crudo */}
      <div className="bg-gray-50 rounded-xl p-3">
        <div className="text-xs font-semibold text-gray-500 mb-1">
          Mensaje original
        </div>
        <p className="text-gray-800">{n.texto_crudo || n.descripcion}</p>
      </div>

      {/* Lo que extrajo la IA, editable */}
      <div className="grid grid-cols-2 gap-2">
        <label className="text-sm">
          Tipo
          <select
            className="input mt-1 py-2"
            value={tipo}
            onChange={(e) => {
              setTipo(e.target.value as NecesidadTipo)
              setEditando(true)
            }}
          >
            {TIPOS.map((t) => (
              <option key={t} value={t}>
                {TIPO_META[t].etiqueta}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Urgencia
          <select
            className="input mt-1 py-2"
            value={urgencia}
            onChange={(e) => {
              setUrgencia(e.target.value as NecesidadUrgencia)
              setEditando(true)
            }}
          >
            {URGENCIAS.map((u) => (
              <option key={u} value={u}>
                {URGENCIA_META[u].etiqueta}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm col-span-2">
          Zona
          <input
            className="input mt-1 py-2"
            value={zona}
            onChange={(e) => {
              setZona(e.target.value)
              setEditando(true)
            }}
            placeholder="(sin zona)"
          />
        </label>
      </div>

      {/* Mini-mapa */}
      {n.lat != null && n.lng != null ? (
        <div className="h-32 rounded-xl overflow-hidden">
          <MapContainer
            center={[n.lat, n.lng]}
            zoom={14}
            className="h-full w-full"
            zoomControl={false}
            dragging={false}
            scrollWheelZoom={false}
            doubleClickZoom={false}
          >
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <Marker position={[n.lat, n.lng]} icon={iconoNecesidad(n.tipo, 'sin_verificar')} />
          </MapContainer>
        </div>
      ) : (
        <p className="text-sm text-amber-600">⚠️ Sin ubicación en el mapa.</p>
      )}

      {/* Posibles duplicados */}
      {duplicados.length > 0 && (
        <div>
          <button
            onClick={() => setVerDuplicados((v) => !v)}
            className="text-sm font-semibold text-bandera-azul"
          >
            🔁 {duplicados.length} posible(s) duplicado(s){' '}
            {verDuplicados ? '▲' : '▼'}
          </button>
          {verDuplicados && (
            <ul className="mt-1 text-sm text-gray-600 list-disc pl-5">
              {duplicados.map((d) => (
                <li key={d.id}>
                  {TIPO_META[d.tipo].etiqueta} — {d.descripcion.slice(0, 40)}…
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Acciones */}
      <div className="grid grid-cols-3 gap-2 pt-1">
        <button
          onClick={() => confirmar(editando)}
          disabled={trabajando}
          className="btn-verde py-3 disabled:opacity-60"
        >
          {editando ? '✏️ Corregir y confirmar' : '✅ Confirmar'}
        </button>
        <button
          onClick={() => confirmar(true)}
          disabled={trabajando}
          className="btn-azul py-3 disabled:opacity-60"
        >
          ✏️ Corregir
        </button>
        <button
          onClick={rechazar}
          disabled={trabajando}
          className="btn-rojo py-3 disabled:opacity-60"
        >
          ❌ Rechazar
        </button>
      </div>

      {/* Comunicación y navegación */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => setAbrirChat(true)}
          className="btn-gris py-2.5"
        >
          💬 Mensaje al reportante
        </button>
        {n.lat != null && n.lng != null ? (
          <a
            href={enlaceComoLlegar(n.lat, n.lng)}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-amber py-2.5 text-center no-underline"
          >
            🧭 Cómo llegar
          </a>
        ) : (
          <span />
        )}
      </div>

      {abrirChat && (
        <ChatNecesidad
          necesidadId={n.id}
          titulo={`${TIPO_META[n.tipo].etiqueta}${n.zona ? ' · ' + n.zona : ''}`}
          onCerrar={() => setAbrirChat(false)}
        />
      )}
    </div>
  )
}
