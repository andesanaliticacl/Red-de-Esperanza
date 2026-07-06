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
import { cargarContactosNecesidad } from '../lib/contactos'
import { cambiarTipoNecesidad, eliminarDelMapa } from '../lib/reportes'
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
  'zona_sin_atender',
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

// Columnas de necesidad (mismas que el hook): para traer MIS casos asignados.
const COLS_NECESIDAD =
  'id, tipo, urgencia, estado, descripcion, zona, lat, lng, radio_km, origen, reportado_por, asignado_a, creado_en, eliminada_del_mapa'

// Columnas extra para el REGISTRO de eliminadas (quién y cuándo se quitó).
const COLS_ELIMINADA =
  COLS_NECESIDAD + ', eliminada_en, eliminada_por, motivo_eliminacion'

const FECHA_MINIMA_VISIBLE = '2026-07-01T00:00:00.000Z'

// Fecha de creación legible (día, mes y hora) — para estimar la prioridad.
function fechaCorta(iso: string): string {
  return new Date(iso).toLocaleString('es-VE', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// Texto del origen (ciudad, país) desde donde se creó la solicitud, por IP.
function textoOrigen(o?: {
  pais: string | null
  ciudad: string | null
}): string | null {
  if (!o || (!o.pais && !o.ciudad)) return null
  return [o.ciudad, o.pais].filter(Boolean).join(', ')
}

// Cuánto tiempo lleva reportada (hace X). Cuanto más vieja, más espera lleva.
function hace(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const min = Math.floor(ms / 60000)
  if (min < 1) return 'recién'
  if (min < 60) return `hace ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `hace ${h} h`
  const d = Math.floor(h / 24)
  return `hace ${d} d`
}

export default function VoluntarioView() {
  const { perfil, rol } = useAuth()
  const { notificar } = useNotificaciones()
  const esRescatista =
    rol === 'rescatista' || rol === 'lider_voluntarios' || rol === 'admin'
  // Solo líder de voluntarios/admin pueden quitar (o restaurar) del mapa.
  const puedeEliminar = rol === 'lider_voluntarios' || rol === 'admin'
  const puedeCambiarTipo = rol === 'admin'
  // Sin verificación: los reportes nuevos (y los de datos previos ya
  // verificados) se atienden directamente, más los que están en proceso.
  // El aviso sonoro de "nueva necesidad / SOS" lo da el proveedor global de
  // notificaciones, así suena en cualquier pantalla (no solo aquí).
  const { necesidades, recargar } = useNecesidades([
    'sin_verificar',
    'verificada',
    'en_proceso',
  ])
  // Telefonos de quienes reportaron (tabla privada; la RLS solo deja leerlos al
  // personal). Se cargan antes de armar los conteos para ocultar los reportes
  // sin contacto confirmado.
  const [contactos, setContactos] = useState<Map<string, string>>(new Map())
  const [contactosCargados, setContactosCargados] = useState(false)
  // Origen (pais/ciudad desde donde se creo) por necesidad, para el personal.
  const [origenes, setOrigenes] = useState<
    Map<string, { pais: string | null; ciudad: string | null }>
  >(new Map())
  useEffect(() => {
    setContactosCargados(false)
    cargarContactosNecesidad().then((m) => {
      const cont = new Map<string, string>()
      const orig = new Map<
        string,
        { pais: string | null; ciudad: string | null }
      >()
      for (const [id, c] of m) {
        cont.set(id, c.contacto)
        orig.set(id, { pais: c.pais_origen, ciudad: c.ciudad_origen })
      }
      setContactos(cont)
      setOrigenes(orig)
      setContactosCargados(true)
    })
  }, [necesidades.length])
  // Necesidades ACTIVAS: excluimos las eliminadas del mapa (borrado suave) de
  // todas las secciones normales y de los conteos. Tambien excluimos las que no
  // tienen telefono confirmado (las del icono de telefono bloqueado). Las
  // eliminadas se ven aparte, en su propio registro (filtro "Eliminadas del mapa").
  const activas = useMemo(
    () =>
      contactosCargados
        ? necesidades.filter((n) => !n.eliminada_del_mapa && contactos.has(n.id))
        : [],
    [contactos, contactosCargados, necesidades],
  )
  // Emergencias SOS: siempre visibles arriba, sin importar los filtros.
  const sos = useMemo(
    () =>
      activas.filter(
        (n) =>
          (n.estado === 'sin_verificar' || n.estado === 'verificada') &&
          n.tipo === 'rescate',
      ),
    [activas],
  )

  const [tipoFiltro, setTipoFiltro] = useState<NecesidadTipo | 'todos'>('todos')
  const [zonaFiltro, setZonaFiltro] = useState('')
  // Filtro especial: ver el REGISTRO de solicitudes eliminadas del mapa.
  const [verEliminadas, setVerEliminadas] = useState(false)
  const [trabajando, setTrabajando] = useState<string | null>(null)
  const [chat, setChat] = useState<Necesidad | null>(null)
  const [aRetirar, setARetirar] = useState<Necesidad | null>(null)
  // Diálogo de cierre con nota (solo líderes/admin).
  const [aCerrar, setACerrar] = useState<Necesidad | null>(null)
  const [notaCierre, setNotaCierre] = useState('')
  const [guardandoCierre, setGuardandoCierre] = useState(false)
  // MIS casos asignados (estado en_proceso). Se traen APARTE del tope de 500 del
  // hook: así, aunque entren muchas necesidades nuevas, los casos que la persona
  // tomó siempre aparecen en "Me asigné" para poder cerrarlos/comentarlos.
  const [misAsignadas, setMisAsignadas] = useState<Necesidad[]>([])
  async function cargarMisAsignadas() {
    if (!perfil?.id) {
      setMisAsignadas([])
      return
    }
    const { data } = await supabase
      .from('necesidades')
      .select(COLS_NECESIDAD)
      .eq('asignado_a', perfil.id)
      .eq('estado', 'en_proceso')
      .eq('eliminada_del_mapa', false)
      .gte('creado_en', FECHA_MINIMA_VISIBLE)
    setMisAsignadas((data ?? []) as unknown as Necesidad[])
  }
  useEffect(() => {
    cargarMisAsignadas()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perfil?.id])

  // REGISTRO de eliminadas del mapa (borrado suave). Se cargan aparte, solo
  // cuando se activa el filtro, para no pesar en la vista normal. Incluye quién
  // y cuándo la eliminó, y permite restaurarla (líder/admin).
  const [eliminadas, setEliminadas] = useState<Necesidad[]>([])
  async function cargarEliminadas() {
    const { data } = await supabase
      .from('necesidades')
      .select(COLS_ELIMINADA)
      .eq('eliminada_del_mapa', true)
      .gte('creado_en', FECHA_MINIMA_VISIBLE)
      .order('eliminada_en', { ascending: false })
      .limit(500)
    setEliminadas((data ?? []) as unknown as Necesidad[])
  }
  useEffect(() => {
    if (verEliminadas) cargarEliminadas()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verEliminadas])
  const [nombres, setNombres] = useState<Map<string, PerfilPublico>>(new Map())
  // Cuántas solicitudes hay con el MISMO teléfono (para avisar de duplicados en
  // la lista, igual que se atenúan en el mapa). Clave: solo los dígitos.
  const conteoTelefono = useMemo(() => {
    const m = new Map<string, number>()
    for (const tel of contactos.values()) {
      const k = tel.replace(/\D/g, '')
      if (k) m.set(k, (m.get(k) ?? 0) + 1)
    }
    return m
  }, [contactos])
  const repeticionesDe = (id: string) => {
    const tel = contactos.get(id)
    return tel ? conteoTelefono.get(tel.replace(/\D/g, '')) ?? 0 : 0
  }

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

  // Resuelve los nombres de quienes ya tomaron una necesidad (asignado_a) y de
  // quienes eliminaron alguna del mapa. Se ACUMULAN (merge) para no perder unos
  // al refrescar los otros.
  useEffect(() => {
    const ids = necesidades.map((n) => n.asignado_a)
    nombresPublicos(ids).then((m) =>
      setNombres((prev) => new Map([...prev, ...m])),
    )
  }, [necesidades])
  useEffect(() => {
    if (!eliminadas.length) return
    nombresPublicos(eliminadas.map((n) => n.eliminada_por ?? null)).then((m) =>
      setNombres((prev) => new Map([...prev, ...m])),
    )
  }, [eliminadas])

  const quienAtiende = (n: Necesidad): string | null =>
    n.asignado_a ? nombres.get(n.asignado_a)?.nombre ?? 'Voluntario' : null

  // Conjunto combinado: las necesidades cargadas (tope 500) + MIS casos
  // asignados (sin tope), sin duplicar. Garantiza que "Me asigné" no se vacíe.
  const todas = useMemo(() => {
    const map = new Map<string, Necesidad>()
    for (const n of activas) map.set(n.id, n)
    for (const n of misAsignadas) {
      if (!contactosCargados || !contactos.has(n.id) || map.has(n.id)) continue
      map.set(n.id, n)
    }
    return [...map.values()]
  }, [activas, contactos, contactosCargados, misAsignadas])

  const lista = useMemo(
    () =>
      todas
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
    [todas, tipoFiltro, zonaFiltro],
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
        '✅ Te asignaste. Avisamos a la persona que estás atendiendo su solicitud.',
        'exito',
      )
    await recargar()
    await cargarMisAsignadas()
    setTrabajando(null)
  }

  // Pulsar "Atendida": abre el diálogo de cierre para que cualquiera del equipo
  // (voluntario, rescatista, líder o admin) pueda dejar un comentario opcional.
  function iniciarCierre(n: Necesidad) {
    setNotaCierre('')
    setACerrar(n)
  }

  // Guarda el comentario de cierre (si lo hay) y marca el caso como atendido.
  // El comentario se guarda PRIMERO: si falla, no cerramos el caso para que la
  // persona no pierda lo que escribió y pueda reintentar; el error real se
  // muestra tal cual (ayuda a diagnosticar, p. ej. falta correr la migración).
  async function confirmarCierre() {
    const n = aCerrar
    if (!n) return
    setGuardandoCierre(true)
    const nota = notaCierre.trim()

    if (nota) {
      const { error: e2 } = await supabase
        .from('notas_cierre')
        .insert({ necesidad_id: n.id, autor: perfil?.id ?? null, nota })
      if (e2) {
        notificar('No se pudo guardar tu comentario: ' + e2.message, 'alerta')
        setGuardandoCierre(false)
        return
      }
    }

    const { error } = await supabase
      .from('necesidades')
      .update({ estado: 'resuelta' })
      .eq('id', n.id)
    if (error) {
      notificar('No se pudo cerrar el caso: ' + error.message, 'alerta')
      setGuardandoCierre(false)
      return
    }

    notificar(
      nota ? '✅ Caso cerrado con tu comentario.' : '✅ Caso cerrado.',
      'exito',
    )
    setACerrar(null)
    setNotaCierre('')
    setGuardandoCierre(false)
    await recargar()
    await cargarMisAsignadas()
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
    await cargarMisAsignadas()
    setTrabajando(null)
  }

  // Quitar del mapa (líder/admin): borrado suave. Realtime la marca eliminada y
  // desaparece de las listas activas al instante.
  async function eliminarDelMapaHandler(n: Necesidad, motivo: string) {
    try {
      await eliminarDelMapa(n.id, true, motivo)
      notificar('🗑️ Solicitud eliminada del mapa. Queda registrada.', 'exito')
      await recargar()
      await cargarMisAsignadas()
    } catch (e) {
      notificar('No se pudo eliminar: ' + (e as Error).message, 'alerta')
    }
  }

  async function cambiarTipoHandler(n: Necesidad, tipo: NecesidadTipo) {
    if (tipo === n.tipo) return
    try {
      await cambiarTipoNecesidad(n.id, tipo)
      notificar('Tipo de alerta actualizado.', 'exito')
      await recargar()
      await cargarMisAsignadas()
    } catch (e) {
      notificar('No se pudo cambiar el tipo: ' + (e as Error).message, 'alerta')
    }
  }

  // Restaurar una solicitud eliminada: vuelve a aparecer en el mapa y las listas.
  async function restaurarDelMapa(n: Necesidad) {
    try {
      await eliminarDelMapa(n.id, false)
      notificar('♻️ Solicitud restaurada al mapa.', 'exito')
      await cargarEliminadas()
      await recargar()
    } catch (e) {
      notificar('No se pudo restaurar: ' + (e as Error).message, 'alerta')
    }
  }

  const enCurso = lista.filter((n) => n.estado === 'en_proceso')
  const mias = enCurso.filter((n) => n.asignado_a === perfil?.id)
  const deOtros = enCurso.filter((n) => n.asignado_a !== perfil?.id)
  // Abiertas = reportes por atender que NO son SOS (esos van en su sección).
  const abiertas = lista.filter(
    (n) =>
      (n.estado === 'sin_verificar' || n.estado === 'verificada') &&
      n.tipo !== 'rescate',
  )

  // Resumen consolidado por tipo (sobre todas las solicitudes activas cargadas).
  // El SOS va aparte (rescate u origen 'sos'), por ser la máxima prioridad.
  const totalSos = useMemo(
    () =>
      activas.filter((n) => n.tipo === 'rescate').length,
    [activas],
  )
  const conteoTipos = useMemo(
    () =>
      RESUMEN_TIPOS.map((t) => ({
        tipo: t,
        n: activas.filter((x) => x.tipo === t).length,
      })).filter((c) => c.n > 0),
    [activas],
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
      {!verEliminadas && sos.length > 0 && (
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
                  {n.zona ? `📍 ${n.zona}` : ''}
                </div>
                <div className="text-xs font-semibold text-bandera-rojo">
                  🕒 {fechaCorta(n.creado_en)} · {hace(n.creado_en)}
                </div>
                <Link
                  to={`/?necesidad=${n.id}`}
                  className="inline-block text-xs font-semibold text-bandera-rojo mt-1 no-underline"
                >
                  🗺️ Ver en el mapa
                </Link>
                {/* Origen, teléfono (Llamar/WhatsApp) y duplicados del SOS. */}
                <InfoContacto
                  contacto={contactos.get(n.id) ?? null}
                  origen={origenes.get(n.id)}
                  repeticiones={repeticionesDe(n.id)}
                />
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
          className={`rounded-lg border px-2 py-2 text-sm font-semibold ${
            verEliminadas ? 'border-bandera-rojo text-bandera-rojo' : ''
          }`}
          value={verEliminadas ? 'eliminadas' : 'activas'}
          onChange={(e) => setVerEliminadas(e.target.value === 'eliminadas')}
        >
          <option value="activas">✅ Solicitudes activas</option>
          <option value="eliminadas">🗑️ Eliminadas del mapa</option>
        </select>
        {!verEliminadas && (
          <>
            <select
              className="rounded-lg border px-2 py-2 text-sm"
              value={tipoFiltro}
              onChange={(e) =>
                setTipoFiltro(e.target.value as NecesidadTipo | 'todos')
              }
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
          </>
        )}
      </div>

      {!verEliminadas && (
      <>
      {/* Mapa de lo verificado */}
      <div className="h-56 rounded-2xl overflow-hidden shadow">
        <MapaNecesidades
          necesidades={lista}
          onMensaje={(n) => setChat(n)}
          onAsignarme={(n) => {
            // Un SOS solo lo puede tomar un rescatista (igual que en la lista).
            if (n.tipo === 'rescate' && !esRescatista) {
              notificar(
                'Solo los rescatistas pueden tomar una emergencia SOS.',
                'alerta',
              )
              return
            }
            void asignarme(n)
          }}
          onEliminarDelMapa={puedeEliminar ? eliminarDelMapaHandler : undefined}
          onCambiarTipo={puedeCambiarTipo ? cambiarTipoHandler : undefined}
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
                origen={origenes.get(n.id)}
                repeticiones={repeticionesDe(n.id)}
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
                origen={origenes.get(n.id)}
                repeticiones={repeticionesDe(n.id)}
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
                origen={origenes.get(n.id)}
                repeticiones={repeticionesDe(n.id)}
                trabajando={trabajando === n.id}
                accion="asignar"
                onAccion={() => asignarme(n)}
                onChat={() => setChat(n)}
              />
            ))}
          </div>
        )}
      </section>
      </>
      )}

      {/* Registro de solicitudes ELIMINADAS del mapa (borrado suave) */}
      {verEliminadas && (
        <section>
          <div className="rounded-xl bg-gray-50 border border-gray-200 p-3 mb-3 text-sm text-gray-600">
            🗑️ <b>Registro de eliminadas del mapa.</b> Estas solicitudes ya no se
            muestran en el mapa, pero quedan aquí como registro.
            {puedeEliminar
              ? ' Puedes restaurarlas al mapa cuando quieras.'
              : ' Solo un líder o admin puede restaurarlas.'}
          </div>
          <h2 className="font-bold text-lg mb-2">
            Eliminadas del mapa ({eliminadas.length})
          </h2>
          {eliminadas.length === 0 ? (
            <div className="card text-center text-gray-500 py-8">
              No hay solicitudes eliminadas del mapa.
            </div>
          ) : (
            <div className="space-y-3">
              {eliminadas.map((n) => (
                <div key={n.id} className="card flex items-start gap-3 opacity-90">
                  <div className="text-3xl grayscale">{TIPO_META[n.tipo].emoji}</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold">
                      {TIPO_META[n.tipo].etiqueta}
                      {n.tipo === 'rescate' && (
                        <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                          🆘 SOS
                        </span>
                      )}
                    </div>
                    <TextoExpandible
                      texto={n.descripcion}
                      className="text-sm text-gray-700"
                    />
                    {n.zona && (
                      <div className="text-xs text-gray-500">📍 {n.zona}</div>
                    )}
                    <div className="text-xs text-gray-500 mt-0.5">
                      🕒 Creada: {fechaCorta(n.creado_en)}
                    </div>
                    <div className="text-xs font-semibold text-bandera-rojo mt-0.5">
                      🗑️ Eliminada
                      {n.eliminada_en ? ` ${fechaCorta(n.eliminada_en)}` : ''}
                      {n.eliminada_por
                        ? ` · por ${nombres.get(n.eliminada_por)?.nombre ?? 'personal'}`
                        : ''}
                    </div>
                    {n.motivo_eliminacion && (
                      <div className="text-xs text-gray-700 mt-1 bg-red-50 border border-red-100 rounded-lg px-2 py-1">
                        <span className="font-semibold">Motivo:</span>{' '}
                        {n.motivo_eliminacion}
                      </div>
                    )}
                  </div>
                  {puedeEliminar && (
                    <button
                      onClick={() => restaurarDelMapa(n)}
                      className="btn-azul py-2 px-3 text-sm whitespace-nowrap"
                    >
                      ♻️ Restaurar
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
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

/**
 * Datos de contacto de una solicitud (para el personal): origen (país/ciudad),
 * teléfono con Llamar/WhatsApp o aviso de que no tiene, y cuántas solicitudes
 * hay con ese mismo número (duplicados).
 */
function InfoContacto({
  contacto,
  origen,
  repeticiones,
}: {
  contacto?: string | null
  origen?: { pais: string | null; ciudad: string | null }
  repeticiones?: number
}) {
  const origenTxt = textoOrigen(origen)
  return (
    <>
      {origenTxt && (
        <div className="text-xs text-gray-500 mt-0.5">
          🌐 Creado desde: {origenTxt}
        </div>
      )}
      {contacto ? (
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
      ) : (
        <div className="mt-1 text-xs font-semibold text-amber-600">
          ⚠️ Sin número de teléfono
        </div>
      )}
      {repeticiones != null && repeticiones > 1 && (
        <div
          className={`mt-1 inline-block text-[11px] font-bold px-2 py-0.5 rounded-full ${
            repeticiones > 3
              ? 'bg-red-100 text-red-700'
              : 'bg-amber-100 text-amber-700'
          }`}
        >
          🔁 {repeticiones} solicitudes con este número
        </div>
      )}
    </>
  )
}

function Fila({
  n,
  numero,
  contacto,
  origen,
  repeticiones,
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
  origen?: { pais: string | null; ciudad: string | null }
  repeticiones?: number
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
        {/* Momento en que se reportó: ayuda a estimar prioridad (lo más viejo
            lleva más esperando). */}
        <div className="text-xs font-semibold text-gray-600 mt-0.5">
          🕒 {fechaCorta(n.creado_en)} · {hace(n.creado_en)}
        </div>
        {atendidaPor && (
          <div className="text-xs font-semibold text-bandera-azul mt-0.5">
            🤝 Atiende: {atendidaPor}
          </div>
        )}
        <InfoContacto
          contacto={contacto}
          origen={origen}
          repeticiones={repeticiones}
        />
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
