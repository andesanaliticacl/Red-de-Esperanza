import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useNecesidades } from '../hooks/useNecesidades'
import { useAvisoMensajes } from '../hooks/useAvisoMensajes'
import { nombresPublicos } from '../lib/perfiles'
import { sonarSOS } from '../lib/sonidos'
import MapaNecesidades from '../components/MapaNecesidades'
import ChatNecesidad from '../components/ChatNecesidad'
import { enlaceComoLlegar } from '../lib/geo'
import IconoRuta from '../components/IconoRuta'
import {
  TIPO_META,
  URGENCIA_META,
  type Necesidad,
  type NecesidadTipo,
  type PerfilPublico,
} from '../lib/types'

const TIPOS: NecesidadTipo[] = [
  'rescate',
  'agua_comida',
  'medicinas',
  'refugio',
  'derrumbe',
  'otro',
]

export default function VoluntarioView() {
  const { perfil } = useAuth()
  // Sin verificación: los reportes nuevos (y los de datos previos ya
  // verificados) se atienden directamente, más los que están en proceso.
  // Al llegar un SOS nuevo, suena la alarma para el personal.
  const { necesidades, recargar } = useNecesidades(
    ['sin_verificar', 'verificada', 'en_proceso'],
    (n) => {
      if (n.tipo === 'rescate' || n.origen === 'sos') sonarSOS()
    },
  )
  // Emergencias SOS: siempre visibles arriba, sin importar los filtros.
  const sos = useMemo(
    () =>
      necesidades.filter(
        (n) =>
          (n.estado === 'sin_verificar' || n.estado === 'verificada') &&
          (n.tipo === 'rescate' || n.origen === 'sos'),
      ),
    [necesidades],
  )

  // Aviso sonoro al llegar mensajes en las necesidades que estoy atendiendo.
  const misIds = useMemo(
    () =>
      necesidades
        .filter((n) => n.asignado_a === perfil?.id)
        .map((n) => n.id),
    [necesidades, perfil?.id],
  )
  useAvisoMensajes(misIds, perfil?.id)

  const [tipoFiltro, setTipoFiltro] = useState<NecesidadTipo | 'todos'>('todos')
  const [zonaFiltro, setZonaFiltro] = useState('')
  const [trabajando, setTrabajando] = useState<string | null>(null)
  const [chat, setChat] = useState<Necesidad | null>(null)
  const [nombres, setNombres] = useState<Map<string, PerfilPublico>>(new Map())

  // Resuelve los nombres de quienes ya tomaron una necesidad (asignado_a).
  useEffect(() => {
    const ids = necesidades.map((n) => n.asignado_a)
    nombresPublicos(ids).then(setNombres)
  }, [necesidades])

  const quienAtiende = (n: Necesidad): string | null =>
    n.asignado_a ? nombres.get(n.asignado_a)?.nombre ?? 'Voluntario' : null

  const lista = useMemo(
    () =>
      necesidades
        .filter((n) => (tipoFiltro === 'todos' ? true : n.tipo === tipoFiltro))
        .filter((n) =>
          zonaFiltro.trim()
            ? (n.zona ?? '')
                .toLowerCase()
                .includes(zonaFiltro.trim().toLowerCase())
            : true,
        )
        .sort(
          (a, b) =>
            URGENCIA_META[a.urgencia].orden - URGENCIA_META[b.urgencia].orden,
        ),
    [necesidades, tipoFiltro, zonaFiltro],
  )

  async function asignarme(n: Necesidad) {
    setTrabajando(n.id)
    const { error } = await supabase
      .from('necesidades')
      .update({ estado: 'en_proceso', asignado_a: perfil?.id ?? null })
      .eq('id', n.id)
      // evita que dos voluntarios tomen la misma
      .in('estado', ['sin_verificar', 'verificada'])
    if (error) alert('Error: ' + error.message)
    await recargar()
    setTrabajando(null)
  }

  async function atender(n: Necesidad) {
    setTrabajando(n.id)
    const { error } = await supabase
      .from('necesidades')
      .update({ estado: 'resuelta' })
      .eq('id', n.id)
    if (error) alert('Error: ' + error.message)
    await recargar()
    setTrabajando(null)
  }

  // El voluntario que se asignó pero ya no puede continuar se retira: la
  // necesidad vuelve al pool abierto para que otra persona la tome.
  async function retirarme(n: Necesidad) {
    if (!confirm('¿Retirarte de esta necesidad? Volverá a quedar disponible para otros.'))
      return
    setTrabajando(n.id)
    const { error } = await supabase
      .from('necesidades')
      .update({ estado: 'sin_verificar', asignado_a: null })
      .eq('id', n.id)
    if (error) alert('Error: ' + error.message)
    await recargar()
    setTrabajando(null)
  }

  const enCurso = lista.filter((n) => n.estado === 'en_proceso')
  const mias = enCurso.filter((n) => n.asignado_a === perfil?.id)
  const deOtros = enCurso.filter((n) => n.asignado_a !== perfil?.id)
  // Abiertas = reportes por atender que NO son SOS (esos van en su sección).
  const abiertas = lista.filter(
    (n) =>
      (n.estado === 'sin_verificar' || n.estado === 'verificada') &&
      !(n.tipo === 'rescate' || n.origen === 'sos'),
  )

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4">
      <h1 className="text-2xl font-extrabold text-bandera-azul">
        Necesidades reportadas
      </h1>

      {/* Emergencias SOS entrantes (sin verificar) — visibles al instante */}
      {sos.length > 0 && (
        <section className="rounded-2xl border-2 border-bandera-rojo bg-red-50 p-3 space-y-2">
          <h2 className="font-extrabold text-bandera-rojo flex items-center gap-2">
            🆘 Emergencias SOS entrantes ({sos.length})
            <span className="text-xs font-normal text-red-700">
              atiende según prioridad
            </span>
          </h2>
          {sos.map((n) => (
            <div
              key={n.id}
              className="bg-white rounded-xl p-3 flex items-center gap-3 shadow-sm"
            >
              <div className="text-2xl animate-pulse">🆘</div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold truncate">
                  {n.descripcion}
                </div>
                <div className="text-xs text-gray-500">
                  {n.zona ? `📍 ${n.zona} · ` : ''}
                  {new Date(n.creado_en).toLocaleTimeString('es-VE', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                {n.lat != null && n.lng != null && (
                  <a
                    href={enlaceComoLlegar(n.lat, n.lng)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-rojo py-2 px-3 text-sm whitespace-nowrap no-underline"
                  >
                    <IconoRuta className="mr-1" /> Ir
                  </a>
                )}
                <button
                  onClick={() => setChat(n)}
                  className="btn-gris py-2 px-3 text-sm whitespace-nowrap"
                >
                  💬
                </button>
              </div>
            </div>
          ))}
        </section>
      )}

      {/* Filtros */}
      <div className="card flex gap-2 flex-wrap">
        <select
          className="rounded-lg border px-2 py-2 text-sm"
          value={tipoFiltro}
          onChange={(e) => setTipoFiltro(e.target.value as NecesidadTipo | 'todos')}
        >
          <option value="todos">Todos los tipos</option>
          {TIPOS.map((t) => (
            <option key={t} value={t}>
              {TIPO_META[t].etiqueta}
            </option>
          ))}
        </select>
        <input
          className="rounded-lg border px-2 py-2 text-sm flex-1"
          placeholder="Filtrar por zona…"
          value={zonaFiltro}
          onChange={(e) => setZonaFiltro(e.target.value)}
        />
      </div>

      {/* Mapa de lo verificado */}
      <div className="h-56 rounded-2xl overflow-hidden shadow">
        <MapaNecesidades necesidades={lista} />
      </div>

      {/* En curso: lo que YO tomé */}
      {mias.length > 0 && (
        <section>
          <h2 className="font-bold text-lg mb-2">
            🙋 Me asigné ({mias.length})
          </h2>
          <div className="space-y-3">
            {mias.map((n) => (
              <Fila
                key={n.id}
                n={n}
                trabajando={trabajando === n.id}
                accion="atender"
                onAccion={() => atender(n)}
                onChat={() => setChat(n)}
                onRetirar={() => retirarme(n)}
              />
            ))}
          </div>
        </section>
      )}

      {/* En curso: tomadas por OTROS (solo lectura, para no chocar) */}
      {deOtros.length > 0 && (
        <section>
          <h2 className="font-bold text-lg mb-2">
            👥 En curso por otros ({deOtros.length})
          </h2>
          <div className="space-y-3">
            {deOtros.map((n) => (
              <Fila
                key={n.id}
                n={n}
                trabajando={trabajando === n.id}
                accion={null}
                atendidaPor={quienAtiende(n)}
                onChat={() => setChat(n)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Abiertas */}
      <section>
        <h2 className="font-bold text-lg mb-2">
          Abiertas ({abiertas.length})
        </h2>
        {abiertas.length === 0 ? (
          <div className="card text-center text-gray-500 py-8">
            No hay necesidades verificadas abiertas ahora mismo.
          </div>
        ) : (
          <div className="space-y-3">
            {abiertas.map((n) => (
              <Fila
                key={n.id}
                n={n}
                trabajando={trabajando === n.id}
                accion="asignar"
                onAccion={() => asignarme(n)}
                onChat={() => setChat(n)}
              />
            ))}
          </div>
        )}
      </section>

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

function Fila({
  n,
  trabajando,
  accion,
  onAccion,
  onChat,
  onRetirar,
  atendidaPor,
}: {
  n: Necesidad
  trabajando: boolean
  accion: 'asignar' | 'atender' | null
  onAccion?: () => void
  onChat: () => void
  onRetirar?: () => void
  atendidaPor?: string | null
}) {
  return (
    <div className="card flex items-center gap-3">
      <div className="text-3xl">{TIPO_META[n.tipo].emoji}</div>
      <div className="flex-1 min-w-0">
        <div className="font-bold">
          {TIPO_META[n.tipo].etiqueta}
          <span
            className={`ml-2 text-xs px-2 py-0.5 rounded-full ${
              n.urgencia === 'alta'
                ? 'bg-red-100 text-red-700'
                : n.urgencia === 'media'
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-green-100 text-green-700'
            }`}
          >
            {URGENCIA_META[n.urgencia].etiqueta}
          </span>
        </div>
        <div className="text-sm text-gray-700 truncate">{n.descripcion}</div>
        {n.zona && <div className="text-xs text-gray-500">📍 {n.zona}</div>}
        {atendidaPor && (
          <div className="text-xs font-semibold text-bandera-azul mt-0.5">
            🤝 Atiende: {atendidaPor}
          </div>
        )}
      </div>
      <div className="flex flex-col gap-2">
        {accion && onAccion && (
          <button
            onClick={onAccion}
            disabled={trabajando}
            className={`${
              accion === 'asignar' ? 'btn-azul' : 'btn-verde'
            } py-2.5 px-4 disabled:opacity-60 whitespace-nowrap`}
          >
            {accion === 'asignar' ? 'Me asigno' : 'Atendida'}
          </button>
        )}
        <button
          onClick={onChat}
          className="btn-gris py-2.5 px-4 whitespace-nowrap"
        >
          💬 Mensajes
        </button>
        {onRetirar && (
          <button
            onClick={onRetirar}
            disabled={trabajando}
            className="py-2.5 px-4 whitespace-nowrap rounded-2xl font-bold border-2 border-bandera-rojo text-bandera-rojo disabled:opacity-60"
          >
            ✋ Retirarme
          </button>
        )}
        {n.lat != null && n.lng != null && (
          <a
            href={enlaceComoLlegar(n.lat, n.lng)}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-amber py-2.5 px-4 whitespace-nowrap text-center no-underline"
          >
            <IconoRuta className="mr-1" /> Cómo llegar
          </a>
        )}
      </div>
    </div>
  )
}
