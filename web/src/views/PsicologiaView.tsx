import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useNotificaciones } from '../context/NotificacionesContext'
import { cargarContactosNecesidad } from '../lib/contactos'
import { nombresPublicos } from '../lib/perfiles'
import { esLiderPsicologia } from '../lib/roles'
import ChatNecesidad from '../components/ChatNecesidad'
import TextoExpandible from '../components/TextoExpandible'
import {
  listarSeguimientos,
  ultimosSeguimientos,
  crearSeguimiento,
  type SeguimientoPsicologia,
} from '../lib/seguimientos'
import {
  listarSolicitudesPsicologo,
  revisarSolicitudPsicologo,
  type SolicitudPsicologo,
} from '../lib/solicitudesPsicologo'
import {
  TIPO_META,
  URGENCIA_META,
  type Necesidad,
  type NecesidadUrgencia,
  type PerfilPublico,
} from '../lib/types'

// Fecha corta (día/mes) para el próximo contacto agendado.
function fechaCortaDia(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('es-VE', {
    day: '2-digit',
    month: 'short',
  })
}

const HOY_ISO = () => new Date().toISOString().slice(0, 10)

const COLS_NECESIDAD =
  'id, tipo, urgencia, estado, descripcion, zona, lat, lng, radio_km, origen, reportado_por, asignado_a, creado_en, eliminada_del_mapa'
const FECHA_MINIMA_VISIBLE = '2026-07-01T00:00:00.000Z'

type FiltroPsicologia =
  | 'todas'
  | 'abiertas'
  | 'en_proceso'
  | 'asignadas_mi'
  | 'resueltas'

function fechaCorta(iso: string): string {
  return new Date(iso).toLocaleString('es-VE', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function hace(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const min = Math.floor(ms / 60000)
  if (min < 1) return 'recién'
  if (min < 60) return `hace ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `hace ${h} h`
  return `hace ${Math.floor(h / 24)} d`
}

export default function PsicologiaView() {
  const { perfil, rol } = useAuth()
  const { notificar } = useNotificaciones()
  const esLider = esLiderPsicologia(rol)
  const [necesidades, setNecesidades] = useState<Necesidad[]>([])
  const [contactos, setContactos] = useState<Map<string, string>>(new Map())
  const [nombres, setNombres] = useState<Map<string, PerfilPublico>>(new Map())
  const [psicologos, setPsicologos] = useState<PerfilPublico[]>([])
  const [filtro, setFiltro] = useState<FiltroPsicologia>('todas')
  const [zonaFiltro, setZonaFiltro] = useState('')
  const [trabajando, setTrabajando] = useState<string | null>(null)
  const [chat, setChat] = useState<Necesidad | null>(null)
  const [aCerrar, setACerrar] = useState<Necesidad | null>(null)
  const [notaCierre, setNotaCierre] = useState('')
  const [cargando, setCargando] = useState(true)
  const [seguimiento, setSeguimiento] = useState<Necesidad | null>(null)
  const [ultimos, setUltimos] = useState<Map<string, SeguimientoPsicologia>>(
    new Map(),
  )

  async function cargar() {
    setCargando(true)
    const { data, error } = await supabase
      .from('necesidades')
      .select(COLS_NECESIDAD)
      .eq('tipo', 'atencion_psicologica')
      .gte('creado_en', FECHA_MINIMA_VISIBLE)
      .in('estado', ['sin_verificar', 'verificada', 'en_proceso', 'resuelta'])
      .order('creado_en', { ascending: false })
      .limit(500)
    if (error) {
      notificar('No se pudieron cargar solicitudes psicológicas: ' + error.message, 'alerta')
      setCargando(false)
      return
    }
    setNecesidades((data ?? []) as unknown as Necesidad[])
    setCargando(false)
  }

  async function cargarEquipo() {
    const { data } = await supabase
      .from('perfiles_publicos')
      .select('id, nombre, rol')
      .in('rol', ['psicologo', 'lider_psicologo'])
      .order('nombre', { ascending: true })
    setPsicologos((data ?? []) as PerfilPublico[])
  }

  useEffect(() => {
    void cargar()
    void cargarEquipo()
    cargarContactosNecesidad().then((m) => {
      const cont = new Map<string, string>()
      for (const [id, c] of m) cont.set(id, c.contacto)
      setContactos(cont)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const ids = [
      ...necesidades.map((n) => n.asignado_a),
      ...necesidades.map((n) => n.reportado_por),
    ]
    nombresPublicos(ids).then(setNombres)
  }, [necesidades])

  useEffect(() => {
    const abiertas = necesidades
      .filter((n) => !n.eliminada_del_mapa && n.estado !== 'resuelta')
      .map((n) => n.id)
    ultimosSeguimientos(abiertas)
      .then(setUltimos)
      .catch(() => setUltimos(new Map()))
  }, [necesidades])

  const stats = useMemo(() => {
    const activas = necesidades.filter((n) => !n.eliminada_del_mapa)
    const abiertas = activas.filter(
      (n) => n.estado === 'sin_verificar' || n.estado === 'verificada',
    ).length
    const enProceso = activas.filter((n) => n.estado === 'en_proceso').length
    const mias = activas.filter((n) => n.asignado_a === perfil?.id).length
    const resueltas = activas.filter((n) => n.estado === 'resuelta').length
    // Seguimiento atrasado: casos en proceso sin ningún seguimiento aún, o con
    // un próximo contacto ya vencido. Ayuda a no perder pacientes de vista.
    const hoy = HOY_ISO()
    const atrasados = activas.filter((n) => {
      if (n.estado !== 'en_proceso') return false
      const u = ultimos.get(n.id)
      if (!u) return true
      return !!u.proximo_contacto && u.proximo_contacto < hoy
    }).length
    return { total: necesidades.length, abiertas, enProceso, mias, resueltas, atrasados }
  }, [necesidades, perfil?.id, ultimos])

  const lista = useMemo(
    () =>
      necesidades
        .filter((n) => {
          if (filtro === 'abiertas')
            return n.estado === 'sin_verificar' || n.estado === 'verificada'
          if (filtro === 'en_proceso') return n.estado === 'en_proceso'
          if (filtro === 'asignadas_mi') return n.asignado_a === perfil?.id
          if (filtro === 'resueltas') return n.estado === 'resuelta'
          return true
        })
        .filter((n) =>
          zonaFiltro.trim()
            ? (n.zona ?? '')
                .toLowerCase()
                .includes(zonaFiltro.trim().toLowerCase())
            : true,
        )
        .sort((a, b) => {
          const estadoA = a.estado === 'resuelta' ? 1 : 0
          const estadoB = b.estado === 'resuelta' ? 1 : 0
          if (estadoA !== estadoB) return estadoA - estadoB
          return +new Date(b.creado_en) - +new Date(a.creado_en)
        }),
    [necesidades, filtro, perfil?.id, zonaFiltro],
  )

  async function asignar(n: Necesidad, id: string | null) {
    setTrabajando(n.id)
    const patch =
      id == null
        ? { asignado_a: null, estado: 'sin_verificar' as const }
        : { asignado_a: id, estado: 'en_proceso' as const }
    const { error } = await supabase.from('necesidades').update(patch).eq('id', n.id)
    if (error) notificar('No se pudo asignar: ' + error.message, 'alerta')
    else {
      notificar(id ? 'Solicitud asignada.' : 'Solicitud liberada.', 'exito')
      await cargar()
    }
    setTrabajando(null)
  }

  async function asignarme(n: Necesidad) {
    if (!perfil?.id) return
    await asignar(n, perfil.id)
  }

  // Solo el líder de psicología (o admin) puede reclasificar la urgencia de
  // un caso: la persona que reporta ya no la elige (se sacó esa pregunta del
  // formulario), así que el equipo la ajusta según lo que lea en el caso.
  async function cambiarUrgencia(n: Necesidad, urgencia: NecesidadUrgencia) {
    setTrabajando(n.id)
    const { error } = await supabase
      .from('necesidades')
      .update({ urgencia })
      .eq('id', n.id)
    if (error) notificar('No se pudo cambiar la urgencia: ' + error.message, 'alerta')
    else await cargar()
    setTrabajando(null)
  }

  async function cerrarCaso() {
    const n = aCerrar
    if (!n) return
    setTrabajando(n.id)
    const nota = notaCierre.trim()
    if (nota) {
      const { error } = await supabase
        .from('notas_cierre')
        .insert({ necesidad_id: n.id, autor: perfil?.id ?? null, nota })
      if (error) {
        notificar('No se pudo guardar la nota: ' + error.message, 'alerta')
        setTrabajando(null)
        return
      }
    }
    const { error } = await supabase
      .from('necesidades')
      .update({ estado: 'resuelta' })
      .eq('id', n.id)
    if (error) notificar('No se pudo cerrar: ' + error.message, 'alerta')
    else {
      notificar('Solicitud psicológica cerrada.', 'exito')
      setACerrar(null)
      setNotaCierre('')
      await cargar()
    }
    setTrabajando(null)
  }

  async function reabrirSolicitud(n: Necesidad) {
    setTrabajando(n.id)
    const estado = n.asignado_a ? 'en_proceso' : 'sin_verificar'
    const { error } = await supabase
      .from('necesidades')
      .update({ estado })
      .eq('id', n.id)
    if (error) {
      notificar('No se pudo reabrir: ' + error.message, 'alerta')
    } else {
      notificar('Solicitud reabierta.', 'exito')
      await cargar()
    }
    setTrabajando(null)
  }

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <div>
        <Link to="/" className="text-sm font-semibold text-bandera-azul no-underline">
          ← Volver al mapa
        </Link>
        <h1 className="text-2xl font-extrabold text-bandera-azul mt-1">
          💙 Atender solicitudes psicológicas
        </h1>
      </div>

      {/* Gente que pide SER psicólogo/a: no es un caso de atención, es una
          solicitud de rol. Solo admin/lider_psicologo pueden aprobarla. */}
      {esLider && <PanelSolicitudesPsicologo />}

      <section className="card">
        <h2 className="font-bold text-sm text-gray-600 mb-2">Dashboard</h2>
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
          <Stat etiqueta="Total" n={stats.total} color="#7C3AED" />
          <Stat etiqueta="Abiertas" n={stats.abiertas} color="#CC0001" />
          <Stat etiqueta="En seguimiento" n={stats.enProceso} color="#002FA7" />
          <Stat etiqueta="Asignadas a mí" n={stats.mias} color="#16A34A" />
          <Stat etiqueta="Finalizadas" n={stats.resueltas} color="#475569" />
          <Stat etiqueta="Seguimiento atrasado" n={stats.atrasados} color="#EA580C" />
        </div>
      </section>

      <div className="card flex gap-2 flex-wrap">
        <select
          className="rounded-lg border px-2 py-2 text-sm font-semibold"
          value={filtro}
          onChange={(e) => setFiltro(e.target.value as FiltroPsicologia)}
        >
          <option value="todas">Todas las solicitudes</option>
          <option value="abiertas">Abiertas</option>
          <option value="en_proceso">En seguimiento</option>
          <option value="asignadas_mi">Asignadas a mí</option>
          <option value="resueltas">Finalizadas</option>
        </select>
        <button
          type="button"
          onClick={() => setFiltro('asignadas_mi')}
          className="btn-azul py-2 px-3 text-sm"
        >
          Asignadas a mí
        </button>
        <input
          className="rounded-lg border px-2 py-2 text-sm flex-1 min-w-[180px]"
          placeholder="Filtrar por zona..."
          value={zonaFiltro}
          onChange={(e) => setZonaFiltro(e.target.value)}
        />
      </div>

      {cargando ? (
        <div className="card text-center text-gray-500 py-8">Cargando...</div>
      ) : lista.length === 0 ? (
        <div className="card text-center text-gray-500 py-8">
          No hay solicitudes psicológicas con este filtro.
        </div>
      ) : (
        <section className="space-y-3">
          {lista.map((n, i) => (
            <SolicitudPsicologica
              key={n.id}
              n={n}
              numero={i + 1}
              contacto={contactos.get(n.id) ?? null}
              asignado={n.asignado_a ? nombres.get(n.asignado_a) : undefined}
              psicologos={psicologos}
              esLider={esLider}
              trabajando={trabajando === n.id}
              puedeCerrar={esLider || n.asignado_a === perfil?.id}
              ultimoSeguimiento={ultimos.get(n.id)}
              onAsignarme={() => void asignarme(n)}
              onAsignar={(id) => void asignar(n, id)}
              onCambiarUrgencia={(u) => void cambiarUrgencia(n, u)}
              onChat={() => setChat(n)}
              onSeguimiento={() => setSeguimiento(n)}
              onReabrir={() => void reabrirSolicitud(n)}
              onCerrar={() => {
                setNotaCierre('')
                setACerrar(n)
              }}
            />
          ))}
        </section>
      )}

      {chat && (
        <ChatNecesidad
          necesidadId={chat.id}
          titulo={`${TIPO_META[chat.tipo].etiqueta}${chat.zona ? ' · ' + chat.zona : ''}`}
          onCerrar={() => setChat(null)}
        />
      )}

      {aCerrar && (
        <div
          className="fixed inset-0 z-[2600] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => !trabajando && setACerrar(null)}
        >
          <div
            className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-extrabold text-bandera-azul mb-1">
              Cerrar atención
            </h2>
            <p className="text-sm text-gray-600 mb-3">
              Puedes dejar una nota de cierre o seguimiento antes de marcarla como
              finalizada.
            </p>
            <textarea
              className="input min-h-[90px]"
              placeholder="Nota de cierre (opcional)..."
              maxLength={1000}
              value={notaCierre}
              onChange={(e) => setNotaCierre(e.target.value)}
            />
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => setACerrar(null)}
                disabled={trabajando === aCerrar.id}
                className="btn-gris flex-1 disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                onClick={() => void cerrarCaso()}
                disabled={trabajando === aCerrar.id}
                className="btn-verde flex-1 disabled:opacity-60"
              >
                Finalizar
              </button>
            </div>
          </div>
        </div>
      )}

      {seguimiento && (
        <ModalSeguimiento
          n={seguimiento}
          autorId={perfil?.id ?? null}
          onCerrar={() => setSeguimiento(null)}
          onGuardado={() => {
            ultimosSeguimientos(
              necesidades
                .filter((x) => !x.eliminada_del_mapa && x.estado !== 'resuelta')
                .map((x) => x.id),
            )
              .then(setUltimos)
              .catch(() => {})
          }}
        />
      )}
    </div>
  )
}

/**
 * Solicitudes de personas que quieren SER psicólogo/a (no casos de
 * atención). Solo admin/lider_psicologo las ven y las aprueban/rechazan
 * (lo exige también la RLS y la función revisar_solicitud_psicologo).
 * Aprobar otorga el rol 'psicologo' en el mismo movimiento.
 */
function PanelSolicitudesPsicologo() {
  const { notificar } = useNotificaciones()
  const [solicitudes, setSolicitudes] = useState<SolicitudPsicologo[]>([])
  const [cargando, setCargando] = useState(true)
  const [trabajando, setTrabajando] = useState<string | null>(null)

  async function cargar() {
    try {
      setSolicitudes(await listarSolicitudesPsicologo())
    } catch (e) {
      notificar('No se pudieron cargar las solicitudes de psicólogo/a: ' + (e as Error).message, 'alerta')
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    void cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const pendientes = solicitudes.filter((s) => s.estado === 'pendiente')

  async function revisar(s: SolicitudPsicologo, aprobar: boolean) {
    if (!aprobar) {
      const motivo = window.prompt(
        'Motivo del rechazo (opcional, se lo mostramos a la persona):',
        '',
      )
      if (motivo === null) return // canceló el prompt
      setTrabajando(s.id)
      try {
        await revisarSolicitudPsicologo(s.id, false, motivo)
        notificar(`Solicitud de ${s.nombre} rechazada.`, 'info')
        await cargar()
      } catch (e) {
        notificar('No se pudo rechazar: ' + (e as Error).message, 'alerta')
      } finally {
        setTrabajando(null)
      }
      return
    }
    setTrabajando(s.id)
    try {
      await revisarSolicitudPsicologo(s.id, true)
      notificar(`✅ ${s.nombre} ahora es psicólogo/a.`, 'exito')
      await cargar()
    } catch (e) {
      notificar('No se pudo aprobar: ' + (e as Error).message, 'alerta')
    } finally {
      setTrabajando(null)
    }
  }

  if (cargando || pendientes.length === 0) return null

  return (
    <section className="card border-2 border-purple-200 bg-purple-50/40">
      <h2 className="font-bold text-purple-900 mb-2">
        🧠 Solicitudes para ser psicólogo/a
        <span className="ml-2 text-xs font-normal text-purple-700">
          ({pendientes.length} pendiente{pendientes.length === 1 ? '' : 's'})
        </span>
      </h2>
      <div className="space-y-2">
        {pendientes.map((s) => (
          <div key={s.id} className="rounded-xl bg-white border border-purple-100 p-3">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div className="min-w-0">
                <div className="font-bold">{s.nombre}</div>
                <div className="text-xs text-gray-500">
                  {[s.pais, s.tipo_documento && `${s.tipo_documento}: ${s.documento}`]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
                <div className="text-xs font-semibold text-bandera-azul mt-0.5 break-all">
                  📞 {s.telefono}
                </div>
                {s.mensaje && (
                  <TextoExpandible texto={s.mensaje} className="text-sm text-gray-700 mt-1" />
                )}
                <div className="text-[11px] text-gray-400 mt-1">
                  {fechaCorta(s.creado_en)} · {hace(s.creado_en)}
                </div>
              </div>
              <div className="flex flex-col gap-1.5 shrink-0">
                <a
                  href={`tel:${s.telefono.replace(/[^\d+]/g, '')}`}
                  className="text-xs bg-bandera-azul !text-white font-semibold px-2.5 py-1 rounded-lg no-underline text-center"
                >
                  📞 Llamar
                </a>
                <a
                  href={`https://wa.me/${s.telefono.replace(/\D/g, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs bg-green-600 !text-white font-semibold px-2.5 py-1 rounded-lg no-underline text-center"
                >
                  WhatsApp
                </a>
                <button
                  onClick={() => void revisar(s, true)}
                  disabled={trabajando === s.id}
                  className="text-xs btn-verde py-1.5 px-2.5 disabled:opacity-60"
                >
                  ✓ Aprobar
                </button>
                <button
                  onClick={() => void revisar(s, false)}
                  disabled={trabajando === s.id}
                  className="text-xs btn-rojo py-1.5 px-2.5 disabled:opacity-60"
                >
                  ✕ Rechazar
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function Stat({ etiqueta, n, color }: { etiqueta: string; n: number; color: string }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
      <div className="text-2xl font-extrabold leading-none" style={{ color }}>
        {n}
      </div>
      <div className="text-[11px] text-gray-600 mt-1">{etiqueta}</div>
    </div>
  )
}

function SolicitudPsicologica({
  n,
  numero,
  contacto,
  asignado,
  psicologos,
  esLider,
  trabajando,
  puedeCerrar,
  ultimoSeguimiento,
  onAsignarme,
  onAsignar,
  onCambiarUrgencia,
  onChat,
  onSeguimiento,
  onReabrir,
  onCerrar,
}: {
  n: Necesidad
  numero: number
  contacto: string | null
  asignado?: PerfilPublico
  psicologos: PerfilPublico[]
  esLider: boolean
  trabajando: boolean
  puedeCerrar: boolean
  ultimoSeguimiento?: SeguimientoPsicologia
  onAsignarme: () => void
  onAsignar: (id: string | null) => void
  onCambiarUrgencia: (u: NecesidadUrgencia) => void
  onChat: () => void
  onSeguimiento: () => void
  onReabrir: () => void
  onCerrar: () => void
}) {
  const abierta = n.estado === 'sin_verificar' || n.estado === 'verificada'
  const atendida = n.estado === 'resuelta'
  const enProceso = n.estado === 'en_proceso'
  const atrasado =
    enProceso &&
    (!ultimoSeguimiento ||
      (!!ultimoSeguimiento.proximo_contacto &&
        ultimoSeguimiento.proximo_contacto < HOY_ISO()))
  return (
    <div className={`card flex items-start gap-3 ${atendida ? 'bg-gray-50 opacity-90' : ''}`}>
      <span className="shrink-0 w-7 h-7 grid place-items-center rounded-full bg-bandera-azul text-white text-xs font-bold">
        {numero}
      </span>
      <div className="text-3xl">💙</div>
      <div className="flex-1 min-w-0 space-y-1">
        <div className="font-bold">
          Apoyo emocional
          <span
            className={`ml-2 text-xs px-2 py-0.5 rounded-full ${
              atendida
                ? 'bg-gray-200 text-gray-700'
                : 'bg-purple-100 text-purple-700'
            }`}
          >
            {atendida
              ? 'Finalizada'
              : n.estado === 'en_proceso'
                ? 'En seguimiento'
                : 'Abierta'}
          </span>
        </div>
        <TextoExpandible texto={n.descripcion} className="text-sm text-gray-700" />
        {n.zona && <div className="text-xs text-gray-500">📍 {n.zona}</div>}
        <div className="text-xs font-semibold text-gray-600 flex items-center gap-1.5 flex-wrap">
          <span>
            🕒 {fechaCorta(n.creado_en)} · {hace(n.creado_en)}
          </span>
          {esLider && !atendida ? (
            <label className="flex items-center gap-1">
              <span>· Urgencia:</span>
              <select
                value={n.urgencia}
                disabled={trabajando}
                onChange={(e) =>
                  onCambiarUrgencia(e.target.value as NecesidadUrgencia)
                }
                className="rounded-md border px-1.5 py-0.5 text-xs font-semibold"
              >
                {(['alta', 'media', 'baja'] as NecesidadUrgencia[]).map((u) => (
                  <option key={u} value={u}>
                    {URGENCIA_META[u].etiqueta}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <span>· {URGENCIA_META[n.urgencia].etiqueta}</span>
          )}
        </div>
        <div className="text-xs font-semibold text-bandera-azul">
          Atiende: {asignado?.nombre ?? 'Sin asignar'}
        </div>
        {enProceso && (
          <div
            className={`text-xs font-semibold ${atrasado ? 'text-bandera-rojo' : 'text-gray-600'}`}
          >
            {ultimoSeguimiento ? (
              <>
                📝 Último seguimiento: {fechaCorta(ultimoSeguimiento.creado_en)}
                {ultimoSeguimiento.proximo_contacto && (
                  <>
                    {' '}
                    · Próximo contacto:{' '}
                    {fechaCortaDia(ultimoSeguimiento.proximo_contacto)}
                    {atrasado && ' (atrasado)'}
                  </>
                )}
              </>
            ) : (
              '⚠️ Sin seguimiento registrado todavía'
            )}
          </div>
        )}
        {atendida && (
          <div className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700">
            Solicitud atendida. No se puede asignar ni contactar mientras esté
            cerrada.
          </div>
        )}
        {!atendida && contacto && (
          <div className="flex flex-wrap items-center gap-1.5">
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
      <div className="flex flex-col gap-2 min-w-[150px]">
        {atendida ? (
          <button
            onClick={onReabrir}
            disabled={trabajando}
            className="btn-azul py-2 px-3 text-sm disabled:opacity-60"
          >
            Reabrir solicitud
          </button>
        ) : (
          <>
        {esLider && (
          <select
            value={n.asignado_a ?? ''}
            disabled={trabajando || n.estado === 'resuelta'}
            onChange={(e) => onAsignar(e.target.value || null)}
            className="rounded-lg border px-2 py-2 text-sm"
          >
            <option value="">Sin asignar</option>
            {psicologos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre ?? 'Psicólogo/a'}
              </option>
            ))}
          </select>
        )}
        {abierta && (
          <button
            onClick={onAsignarme}
            disabled={trabajando}
            className="btn-azul py-2 px-3 text-sm disabled:opacity-60"
          >
            Asignarme
          </button>
        )}
        <button onClick={onChat} className="btn-gris py-2 px-3 text-sm">
          Contactar
        </button>
        <button
          onClick={onSeguimiento}
          className={`py-2 px-3 text-sm rounded-2xl font-bold border-2 ${
            atrasado
              ? 'border-bandera-rojo text-bandera-rojo'
              : 'border-bandera-azul text-bandera-azul'
          }`}
        >
          📝 Seguimiento
        </button>
        {puedeCerrar && n.estado !== 'resuelta' && (
          <button
            onClick={onCerrar}
            disabled={trabajando}
            className="btn-verde py-2 px-3 text-sm disabled:opacity-60"
          >
            Finalizar
          </button>
        )}
          </>
        )}
      </div>
    </div>
  )
}

/**
 * Bitácora de seguimiento de UN caso: historial (más reciente primero) +
 * formulario para agregar nota y agendar el próximo contacto. Privado del
 * equipo psicológico (lo exige la RLS de seguimientos_psicologia).
 */
function ModalSeguimiento({
  n,
  autorId,
  onCerrar,
  onGuardado,
}: {
  n: Necesidad
  autorId: string | null
  onCerrar: () => void
  onGuardado: () => void
}) {
  const [historial, setHistorial] = useState<SeguimientoPsicologia[]>([])
  const [cargando, setCargando] = useState(true)
  const [nota, setNota] = useState('')
  const [proximoContacto, setProximoContacto] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  async function cargar() {
    setCargando(true)
    try {
      setHistorial(await listarSeguimientos(n.id))
    } catch (e) {
      setErrorMsg((e as Error).message)
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    void cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n.id])

  async function guardar() {
    setGuardando(true)
    setErrorMsg('')
    try {
      await crearSeguimiento({
        necesidadId: n.id,
        autor: autorId,
        nota,
        proximoContacto: proximoContacto || null,
      })
      setNota('')
      setProximoContacto('')
      await cargar()
      onGuardado()
    } catch (e) {
      setErrorMsg((e as Error).message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[2600] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onCerrar}
    >
      <div
        className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl p-5 max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-extrabold text-bandera-azul">
            📝 Seguimiento del caso
          </h2>
          <button
            onClick={onCerrar}
            className="text-2xl text-gray-400 leading-none"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>
        <TextoExpandible texto={n.descripcion} className="text-sm text-gray-600 mb-3" />

        <div className="space-y-2 mb-4">
          <label className="block">
            <span className="font-bold text-sm">Nota de la sesión / contacto</span>
            <textarea
              className="input mt-1 min-h-[80px]"
              placeholder="¿Qué se habló? ¿Cómo sigue la persona?"
              maxLength={2000}
              value={nota}
              onChange={(e) => setNota(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="font-bold text-sm">Próximo contacto (opcional)</span>
            <input
              type="date"
              className="input mt-1"
              value={proximoContacto}
              onChange={(e) => setProximoContacto(e.target.value)}
            />
          </label>
          {errorMsg && (
            <p className="text-sm font-semibold text-bandera-rojo">{errorMsg}</p>
          )}
          <button
            onClick={() => void guardar()}
            disabled={guardando || !nota.trim()}
            className="btn-azul w-full disabled:opacity-60"
          >
            {guardando ? 'Guardando…' : 'Guardar seguimiento'}
          </button>
        </div>

        <h3 className="font-bold text-sm text-gray-600 mb-2">Historial</h3>
        {cargando ? (
          <p className="text-sm text-gray-500">Cargando…</p>
        ) : historial.length === 0 ? (
          <p className="text-sm text-gray-500">Aún no hay seguimientos registrados.</p>
        ) : (
          <ul className="space-y-2">
            {historial.map((s) => (
              <li
                key={s.id}
                className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2"
              >
                <div className="text-xs text-gray-500">
                  {fechaCorta(s.creado_en)}
                  {s.proximo_contacto && (
                    <> · Próximo contacto: {fechaCortaDia(s.proximo_contacto)}</>
                  )}
                </div>
                <div className="text-sm text-gray-800 whitespace-pre-wrap">{s.nota}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
