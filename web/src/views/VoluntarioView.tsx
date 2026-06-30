import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useNotificaciones } from '../context/NotificacionesContext'
import { useNecesidades } from '../hooks/useNecesidades'
import { nombresPublicos } from '../lib/perfiles'
import MapaNecesidades from '../components/MapaNecesidades'
import ChatNecesidad from '../components/ChatNecesidad'
import ConfirmDialog from '../components/ConfirmDialog'
import TextoExpandible from '../components/TextoExpandible'
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

// Tipos del resumen consolidado (el SOS/rescate se cuenta aparte por prioridad).
const RESUMEN_TIPOS: NecesidadTipo[] = [
  'derrumbe',
  'zona_sin_atender',
  'agua_comida',
  'medicinas',
  'refugio',
  'otro',
]

export default function VoluntarioView() {
  const { perfil, rol } = useAuth()
  const { notificar } = useNotificaciones()
  const esRescatista =
    rol === 'rescatista' || rol === 'lider_voluntarios' || rol === 'admin'
  // Sin verificación: los reportes nuevos (y los de datos previos ya
  // verificados) se atienden directamente, más los que están en proceso.
  // El aviso sonoro de "nueva necesidad / SOS" lo da el proveedor global de
  // notificaciones, así suena en cualquier pantalla (no solo aquí).
  const { necesidades, recargar } = useNecesidades([
    'sin_verificar',
    'verificada',
    'en_proceso',
  ])
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

  const [tipoFiltro, setTipoFiltro] = useState<NecesidadTipo | 'todos'>('todos')
  const [zonaFiltro, setZonaFiltro] = useState('')
  const [trabajando, setTrabajando] = useState<string | null>(null)
  const [chat, setChat] = useState<Necesidad | null>(null)
  const [aRetirar, setARetirar] = useState<Necesidad | null>(null)
  // Diálogo de cierre con nota (solo líderes/admin).
  const [aCerrar, setACerrar] = useState<Necesidad | null>(null)
  const [notaCierre, setNotaCierre] = useState('')
  const [guardandoCierre, setGuardandoCierre] = useState(false)
  const [nombres, setNombres] = useState<Map<string, PerfilPublico>>(new Map())
  // Teléfonos de quienes reportaron (tabla privada; la RLS solo deja leerlos al
  // personal). Una sola consulta para poder llamar/escribir desde cada tarjeta.
  const [contactos, setContactos] = useState<Map<string, string>>(new Map())
  useEffect(() => {
    supabase
      .from('contactos_necesidad')
      .select('necesidad_id, contacto')
      .then(({ data }) => {
        if (!data) return
        setContactos(
          new Map(
            (data as { necesidad_id: string; contacto: string }[]).map((c) => [
              c.necesidad_id,
              c.contacto,
            ]),
          ),
        )
      })
  }, [necesidades])
  // Las Emergencias SOS se pueden plegar para que no estorben a quien no quiere
  // verlas. Recordamos la preferencia entre visitas.
  const [sosAbierto, setSosAbierto] = useState(() => {
    try {
      return localStorage.getItem('esperanza.sosPlegado') !== '1'
    } catch {
      return true
    }
  })
  function alternarSos() {
    setSosAbierto((v) => {
      try {
        localStorage.setItem('esperanza.sosPlegado', v ? '1' : '0')
      } catch {
        /* ignorar */
      }
      return !v
    })
  }
  const [verAviso, setVerAviso] = useState(() => {
    try {
      return localStorage.getItem('esperanza.avisoSeguridad') !== '1'
    } catch {
      return true
    }
  })

  function cerrarAviso() {
    try {
      localStorage.setItem('esperanza.avisoSeguridad', '1')
    } catch {
      /* ignorar */
    }
    setVerAviso(false)
  }

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
    if (error) notificar('No se pudo asignar: ' + error.message, 'alerta')
    else
      notificar(
        '✅ Te asignaste. Avisamos a la persona que vas en camino.',
        'exito',
      )
    await recargar()
    setTrabajando(null)
  }

  // Pulsar "Atendida": abre el diálogo de cierre para que cualquiera del equipo
  // (voluntario, rescatista, líder o admin) pueda dejar un comentario opcional.
  function iniciarCierre(n: Necesidad) {
    setNotaCierre('')
    setACerrar(n)
  }

  // Cierra el caso (resuelta) y, si el líder escribió una nota, la guarda en la
  // tabla privada `notas_cierre` (solo el personal interno la lee).
  async function confirmarCierre() {
    const n = aCerrar
    if (!n) return
    setGuardandoCierre(true)
    const { error } = await supabase
      .from('necesidades')
      .update({ estado: 'resuelta' })
      .eq('id', n.id)
    if (error) {
      notificar('No se pudo cerrar el caso: ' + error.message, 'alerta')
      setGuardandoCierre(false)
      return
    }
    const nota = notaCierre.trim()
    if (nota) {
      const { error: e2 } = await supabase
        .from('notas_cierre')
        .insert({ necesidad_id: n.id, autor: perfil?.id ?? null, nota })
      if (e2)
        notificar(
          'Caso cerrado, pero no se pudo guardar la nota: ' + e2.message,
          'alerta',
        )
      else notificar('✅ Caso cerrado con tu comentario.', 'exito')
    } else {
      notificar('✅ Caso cerrado.', 'exito')
    }
    setACerrar(null)
    setNotaCierre('')
    setGuardandoCierre(false)
    await recargar()
  }

  // El voluntario que se asignó pero ya no puede continuar se retira: la
  // necesidad vuelve al pool abierto para que otra persona la tome.
  async function confirmarRetiro() {
    const n = aRetirar
    setARetirar(null)
    if (!n) return
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

  // Resumen consolidado por tipo (sobre todas las solicitudes activas cargadas).
  // El SOS va aparte (rescate u origen 'sos'), por ser la máxima prioridad.
  const totalSos = useMemo(
    () =>
      necesidades.filter((n) => n.tipo === 'rescate' || n.origen === 'sos')
        .length,
    [necesidades],
  )
  const conteoTipos = useMemo(
    () =>
      RESUMEN_TIPOS.map((t) => ({
        tipo: t,
        n: necesidades.filter((x) => x.tipo === t).length,
      })).filter((c) => c.n > 0),
    [necesidades],
  )

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4">
      <h1 className="text-2xl font-extrabold text-bandera-azul">
        Necesidades reportadas
      </h1>

      {/* Resumen consolidado: total de solicitudes por tipo */}
      <section className="card">
        <h2 className="font-bold text-sm text-gray-600 mb-2">
          Resumen por tipo de solicitud
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <ResumenTipo emoji="🆘" etiqueta="SOS" n={totalSos} color="#CC0001" />
          {conteoTipos.map((c) => (
            <ResumenTipo
              key={c.tipo}
              emoji={TIPO_META[c.tipo].emoji}
              etiqueta={TIPO_META[c.tipo].etiqueta}
              n={c.n}
              color={TIPO_META[c.tipo].color}
            />
          ))}
        </div>
      </section>

      {/* Aviso de seguridad (sutil, se puede cerrar) */}
      {verAviso && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 flex items-start gap-2 text-sm text-amber-900">
          <span className="text-lg leading-none">⚠️</span>
          <p className="flex-1">
            <b>Tu seguridad primero.</b> No arriesgues tu vida innecesariamente.
            Si la situación es muy peligrosa, no entres: avisa a los organismos
            de rescate y coordina desde un lugar seguro.
          </p>
          <button
            onClick={cerrarAviso}
            className="text-amber-700 font-bold leading-none"
            aria-label="Cerrar aviso"
          >
            ✕
          </button>
        </div>
      )}

      {/* Emergencias SOS entrantes (sin verificar) — visibles al instante */}
      {sos.length > 0 && (
        <section className="rounded-2xl border-2 border-bandera-rojo bg-red-50 p-3 space-y-2">
          <button
            onClick={alternarSos}
            className="w-full flex items-center gap-2 text-left"
            aria-expanded={sosAbierto}
          >
            <span className="text-bandera-rojo">{sosAbierto ? '▼' : '▶'}</span>
            <h2 className="font-extrabold text-bandera-rojo flex items-center gap-2 flex-1">
              🆘 Emergencias SOS entrantes ({sos.length})
              <span className="text-xs font-normal text-red-700">
                {esRescatista
                  ? 'atiende según prioridad'
                  : 'solo rescatistas las atienden'}
              </span>
            </h2>
            <span className="text-xs font-semibold text-red-700">
              {sosAbierto ? 'Ocultar' : 'Mostrar'}
            </span>
          </button>
          {sosAbierto &&
            sos.map((n, i) => (
            <div
              key={n.id}
              className="bg-white rounded-xl p-3 flex items-center gap-3 shadow-sm"
            >
              <span className="shrink-0 w-6 h-6 flex items-center justify-center rounded-full bg-bandera-rojo text-white text-xs font-bold">
                {i + 1}
              </span>
              <div className="text-2xl animate-pulse">🆘</div>
              <div className="flex-1 min-w-0">
                <TextoExpandible
                  texto={n.descripcion}
                  className="text-sm font-semibold"
                />
                <div className="text-xs text-gray-500">
                  {n.zona ? `📍 ${n.zona} · ` : ''}
                  {new Date(n.creado_en).toLocaleTimeString('es-VE', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </div>
                <Link
                  to={`/?necesidad=${n.id}`}
                  className="inline-block text-xs font-semibold text-bandera-rojo mt-1 no-underline"
                >
                  🗺️ Ver en el mapa
                </Link>
              </div>
              <div className="flex flex-col gap-1.5">
                {n.lat != null && n.lng != null && (
                  <a
                    href={enlaceComoLlegar(n.lat, n.lng)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-rojo py-2 px-3 text-sm whitespace-nowrap no-underline"
                  >
                    <IconoRuta className="mr-1" /> Cómo llegar
                  </a>
                )}
                {/* Solo los rescatistas (y admin) pueden tomar/atender un SOS.
                    "Voy en camino" lo pasa a en_proceso → en el mapa aparece el
                    cartelito y al creador le llega el aviso de que ya lo atienden. */}
                {esRescatista && (
                  <>
                    <button
                      onClick={() => asignarme(n)}
                      disabled={trabajando === n.id}
                      className="btn-verde py-2 px-3 text-sm whitespace-nowrap disabled:opacity-60"
                    >
                      🙋 Asignarme
                    </button>
                    <button
                      onClick={() => setChat(n)}
                      className="btn-gris py-2 px-3 text-sm whitespace-nowrap"
                    >
                      💬 Contactar
                    </button>
                  </>
                )}
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
        <MapaNecesidades
          necesidades={lista}
          onMensaje={(n) => setChat(n)}
          onAsignarme={(n) => {
            // Un SOS solo lo puede tomar un rescatista (igual que en la lista).
            if ((n.tipo === 'rescate' || n.origen === 'sos') && !esRescatista) {
              notificar(
                'Solo los rescatistas pueden tomar una emergencia SOS.',
                'alerta',
              )
              return
            }
            void asignarme(n)
          }}
          puedeVerContacto
          ajustarVista
        />
      </div>

      {/* En curso: lo que YO tomé */}
      {mias.length > 0 && (
        <section>
          <h2 className="font-bold text-lg mb-2">
            🙋 Me asigné ({mias.length})
          </h2>
          <div className="space-y-3">
            {mias.map((n, i) => (
              <Fila
                key={n.id}
                n={n}
                numero={i + 1}
                contacto={contactos.get(n.id) ?? null}
                trabajando={trabajando === n.id}
                accion="atender"
                onAccion={() => iniciarCierre(n)}
                onChat={() => setChat(n)}
                onRetirar={() => setARetirar(n)}
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
            {deOtros.map((n, i) => (
              <Fila
                key={n.id}
                n={n}
                numero={i + 1}
                contacto={contactos.get(n.id) ?? null}
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
            {abiertas.map((n, i) => (
              <Fila
                key={n.id}
                n={n}
                numero={i + 1}
                contacto={contactos.get(n.id) ?? null}
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

      <ConfirmDialog
        abierto={!!aRetirar}
        emoji="✋"
        titulo="¿Retirarte de esta necesidad?"
        mensaje="Volverá a quedar disponible para que otra persona la tome."
        textoConfirmar="Sí, retirarme"
        peligro
        onConfirmar={confirmarRetiro}
        onCancelar={() => setARetirar(null)}
      />

      {/* Cierre con comentario (solo líderes/admin) */}
      {aCerrar && (
        <div
          className="fixed inset-0 z-[2600] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => !guardandoCierre && setACerrar(null)}
        >
          <div
            className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-extrabold text-bandera-azul mb-1">
              ✅ Cerrar caso
            </h2>
            <p className="text-sm text-gray-600 mb-3">
              {TIPO_META[aCerrar.tipo].etiqueta}
              {aCerrar.zona ? ` · ${aCerrar.zona}` : ''}. Lo marcarás como{' '}
              <b>atendido</b>. Puedes dejar un comentario de cierre (opcional):
              cómo se resolvió, observaciones, etc.
            </p>
            <textarea
              className="input min-h-[90px]"
              placeholder="Comentario de cierre (opcional)…"
              maxLength={1000}
              value={notaCierre}
              onChange={(e) => setNotaCierre(e.target.value)}
            />
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => setACerrar(null)}
                disabled={guardandoCierre}
                className="btn-gris flex-1 disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                onClick={confirmarCierre}
                disabled={guardandoCierre}
                className="btn-verde flex-1 disabled:opacity-60"
              >
                {guardandoCierre ? 'Guardando…' : 'Marcar como atendida'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/** Tarjetita del resumen: emoji + total de un tipo de solicitud. */
function ResumenTipo({
  emoji,
  etiqueta,
  n,
  color,
}: {
  emoji: string
  etiqueta: string
  n: number
  color: string
}) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-gray-100 bg-gray-50 px-2.5 py-1.5">
      <span className="text-xl">{emoji}</span>
      <div className="min-w-0">
        <div className="text-lg font-extrabold leading-none" style={{ color }}>
          {n}
        </div>
        <div className="text-[11px] text-gray-600 truncate">{etiqueta}</div>
      </div>
    </div>
  )
}

function Fila({
  n,
  numero,
  contacto,
  trabajando,
  accion,
  onAccion,
  onChat,
  onRetirar,
  atendidaPor,
}: {
  n: Necesidad
  numero?: number
  contacto?: string | null
  trabajando: boolean
  accion: 'asignar' | 'atender' | null
  onAccion?: () => void
  onChat: () => void
  onRetirar?: () => void
  atendidaPor?: string | null
}) {
  return (
    <div className="card flex items-center gap-3">
      {numero != null && (
        <span className="shrink-0 w-6 h-6 flex items-center justify-center rounded-full bg-bandera-azul text-white text-xs font-bold">
          {numero}
        </span>
      )}
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
        <TextoExpandible texto={n.descripcion} className="text-sm text-gray-700" />
        {n.zona && <div className="text-xs text-gray-500">📍 {n.zona}</div>}
        {atendidaPor && (
          <div className="text-xs font-semibold text-bandera-azul mt-0.5">
            🤝 Atiende: {atendidaPor}
          </div>
        )}
        {/* Teléfono de quien reportó: para que el personal pueda comunicarse. */}
        {contacto && (
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-bold text-bandera-azul break-all">
              📞 {contacto}
            </span>
            <a
              href={`tel:${contacto.replace(/[^\d+]/g, '')}`}
              className="text-xs bg-bandera-azul !text-white font-semibold px-2 py-0.5 rounded-lg no-underline"
            >
              Llamar
            </a>
            <a
              href={`https://wa.me/${contacto.replace(/\D/g, '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs bg-green-600 !text-white font-semibold px-2 py-0.5 rounded-lg no-underline"
            >
              WhatsApp
            </a>
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
          💬 Contactar
        </button>
        <Link
          to={`/?necesidad=${n.id}`}
          className="btn-gris py-2.5 px-4 whitespace-nowrap text-center no-underline"
        >
          🗺️ Ver en el mapa
        </Link>
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
