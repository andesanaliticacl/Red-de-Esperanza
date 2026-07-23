import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import MapaNecesidades from '../components/MapaNecesidades'
import CampanaNotificaciones from '../components/CampanaNotificaciones'
import ReportarModal from '../components/ReportarModal'
import SosModal from '../components/SosModal'
import ChatGlobal from '../components/ChatGlobal'
import ChatNecesidad from '../components/ChatNecesidad'
import TutorialModal from '../components/TutorialModal'
import MenuUsuario from '../components/MenuUsuario'
import { useNecesidades } from '../hooks/useNecesidades'
import { cambiarTipoNecesidad, eliminarDelMapa } from '../lib/reportes'
import {
  esRolPsicologia,
  esRolRescatista,
  puedeAtenderNecesidades,
  puedeGestionarComoLider,
  puedeVerNecesidad,
} from '../lib/roles'
import type { Desaparecido } from '../hooks/useDesaparecidos'
import { useUbicacionAuto } from '../hooks/useUbicacionAuto'
import { useAuth } from '../context/AuthContext'
import { useNotificaciones } from '../context/NotificacionesContext'
import {
  TIPO_META,
  ROL_META,
  type Necesidad,
  type CentroAcopio,
  type NecesidadTipo,
  type NecesidadUrgencia,
  type RolRegistro,
} from '../lib/types'

// Accesos directos de inicio de sesión por rol (en el orden pedido).
const ROLES_ACCESO: RolRegistro[] = [
  'rescatista',
  'voluntario',
  'ciudadano',
  'centro_acopio',
]

// Opciones del filtro por tipo. Incluye las necesidades, los centros de acopio
// y un valor especial 'hospital' (los acopios cuya descripción dice "hospital").
const TIPOS_FILTRO: NecesidadTipo[] = [
  'rescate',
  'atencion_psicologica',
  'zona_sin_atender',
  'zona_aislada',
  'agua_comida',
  'medicinas',
  'refugio',
  'derrumbe',
  'inundacion',
  'incendio',
  'sacos_arena',
  'mascota',
  'otro',
  'acopio',
]
// Filtro de tipo: necesidad, 'todos', o 'hospital' (subtipo de acopio).
type FiltroTipo = NecesidadTipo | 'todos' | 'hospital'

const CLAVE_TUTORIAL = 'esperanza.tutorialVisto'
const COLS_PERSONAS_HOSPITAL =
  'id, cedula, nombre, apellido, edad, es_menor, estatus, locacion, hospital_normalizado, ultima_ubicacion, condicion, ultima_actualizacion, contacto'

interface PersonaHospitalDB {
  id: string
  cedula: string | null
  nombre: string | null
  apellido: string | null
  edad: number | string | null
  es_menor: boolean | null
  estatus: string | null
  locacion: string | null
  hospital_normalizado: string | null
  ultima_ubicacion: string | null
  condicion: string | null
  ultima_actualizacion: string | null
  contacto: string | null
}

interface PersonaHospital {
  id: string
  cedula: string | null
  nombre: string
  apellido: string
  edad: number | string | null
  esMenor: boolean
  estatus: string
  locacion: string
  ultimaUbicacion: string | null
  condicion: string | null
  ultimaActualizacion: string | null
  contacto: string | null
}

function normalizarTexto(valor: string | null | undefined) {
  return (valor ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

const PALABRAS_GENERICAS_HOSPITAL = new Set([
  'hospital',
  'centro',
  'clinico',
  'clinica',
  'dr',
  'dra',
  'doctor',
  'general',
  'universitario',
  'universitaria',
  'de',
  'del',
  'la',
  'las',
  'los',
  'el',
  'y',
])

const HOSPITALES_CANONICOS = [
  {
    clave: 'jose maria vargas',
    alias: ['jose maria vargas', 'jose maria', 'vargas'],
  },
  {
    clave: 'perez carreno',
    alias: ['perez carreno', 'perez carreño'],
  },
  {
    clave: 'domingo luciani',
    alias: ['domingo luciani'],
  },
  {
    clave: 'periferico catia',
    alias: ['periferico catia', 'periferico de catia'],
  },
  {
    clave: 'carlos arvelo',
    alias: ['carlos arvelo', 'militar carlos arvelo'],
  },
]

function claveHospital(valor: string | null | undefined) {
  return normalizarTexto(valor)
    .split(' ')
    .filter((palabra) => palabra.length > 1 && !PALABRAS_GENERICAS_HOSPITAL.has(palabra))
    .join(' ')
}

function claveHospitalConsulta(valor: string | null | undefined) {
  const clave = claveHospital(valor)
  const tokens = new Set(clave.split(' '))

  for (const hospital of HOSPITALES_CANONICOS) {
    for (const alias of hospital.alias) {
      const aliasNormalizado = claveHospital(alias)
      const aliasTokens = aliasNormalizado.split(' ')
      const coincidencias = aliasTokens.filter((token) => tokens.has(token))
      if (
        clave.includes(aliasNormalizado) ||
        aliasNormalizado.includes(clave) ||
        coincidencias.length >= Math.min(2, aliasTokens.length)
      ) {
        return hospital.clave
      }
    }
  }

  return clave
}

function adaptarPersonaHospital(persona: PersonaHospitalDB): PersonaHospital {
  return {
    id: persona.id,
    cedula: persona.cedula,
    nombre: persona.nombre ?? '',
    apellido: persona.apellido ?? '',
    edad: persona.edad,
    esMenor: persona.es_menor ?? false,
    estatus: persona.estatus ?? 'HOSPITAL',
    locacion: persona.locacion ?? '',
    ultimaUbicacion: persona.ultima_ubicacion,
    condicion: persona.condicion,
    ultimaActualizacion: persona.ultima_actualizacion,
    contacto: persona.contacto,
  }
}

function esMenorDeEdad(edad: PersonaHospital['edad']) {
  if (edad == null || edad === '') return false
  const edadNumerica =
    typeof edad === 'number' ? edad : Number(String(edad).replace(/[^\d.]/g, ''))

  return Number.isFinite(edadNumerica) && edadNumerica < 18
}

function PersonaHospitalItem({ persona }: { persona: PersonaHospital }) {
  const nombreCompleto = [persona.nombre, persona.apellido].filter(Boolean).join(' ')
  const menorDeEdad = persona.esMenor || esMenorDeEdad(persona.edad)
  const edadVisible = !menorDeEdad && persona.edad ? `${persona.edad} años` : null
  const detallesPrincipales = [edadVisible, persona.locacion].filter(Boolean)

  return (
    <li>
      <div className="w-full flex items-start gap-3 p-3 text-left">
        <span className="h-12 w-12 rounded-full bg-red-50 text-bandera-rojo grid place-items-center shrink-0 text-lg font-bold">
          H
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-sm font-semibold text-gray-900">
              {nombreCompleto || 'Sin nombre'}
            </span>
            {!menorDeEdad && persona.cedula && (
              <span className="text-xs font-bold text-bandera-azul">
                C.I. {persona.cedula}
              </span>
            )}
          </span>
          {detallesPrincipales.length > 0 && (
            <span className="block text-xs text-gray-500 mt-0.5">
              {detallesPrincipales.join(' · ')}
            </span>
          )}
          {persona.condicion && (
            <span className="block text-xs text-gray-700 mt-1">
              {persona.condicion}
            </span>
          )}
        </span>
      </div>
    </li>
  )
}

function personaCoincideConBusqueda(persona: PersonaHospital, busqueda: string) {
  const termino = busqueda.trim().toLowerCase()
  if (!termino) return true

  const soloNumeros = /^\d+$/.test(termino)
  if (soloNumeros) {
    return (persona.cedula ?? '').replace(/\D/g, '').includes(termino)
  }

  return [persona.nombre, persona.apellido]
    .join(' ')
    .toLowerCase()
    .includes(termino)
}

function PersonasHospitalModal({
  hospital,
  personas,
  cargando,
  onCerrar,
}: {
  hospital: CentroAcopio
  personas: PersonaHospital[]
  cargando: boolean
  onCerrar: () => void
}) {
  const [busqueda, setBusqueda] = useState('')
  const personasFiltradas = personas.filter((persona) =>
    personaCoincideConBusqueda(persona, busqueda),
  )

  return (
    <div
      className="fixed inset-0 z-[3000] bg-black/60 backdrop-blur-[2px] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="personas-hospital-titulo"
      onClick={onCerrar}
    >
      <div
        className="w-full max-w-lg max-h-[86vh] bg-white rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 px-4 py-3 border-b border-gray-100">
          <div className="min-w-0 flex-1">
            <h2
              id="personas-hospital-titulo"
              className="font-bold text-gray-900 leading-tight"
            >
              Personas en este hospital
            </h2>
            <p className="text-sm font-semibold text-bandera-rojo truncate">
              {hospital.nombre}
            </p>
            <p className="text-xs text-gray-500 truncate">
              {[hospital.ciudad, hospital.estado, hospital.pais]
                .filter(Boolean)
                .join(', ')}
            </p>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            className="h-9 w-9 rounded-full grid place-items-center text-gray-500 hover:bg-gray-100 hover:text-gray-800 text-xl leading-none"
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>

        <div className="px-4 py-2 bg-gray-50 border-b border-gray-100">
          <p className="text-xs text-gray-600">
            Se muestran solo registros activos en la base con estatus HOSPITAL asociados a este hospital.
          </p>
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar persona por nombre..."
            className="mt-2 w-full rounded-lg border-2 border-gray-200 bg-white px-3 py-2 text-sm"
            autoFocus
          />
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {cargando ? (
            <p className="text-sm text-gray-500 p-6 text-center">
              Buscando personas asociadas...
            </p>
          ) : personas.length === 0 ? (
            <p className="text-sm text-gray-500 p-6 text-center">
              No hay personas asociadas a este hospital con los datos actuales.
            </p>
          ) : personasFiltradas.length === 0 ? (
            <p className="text-sm text-gray-500 p-6 text-center">
              No hay personas que coincidan con "{busqueda.trim()}".
            </p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {personasFiltradas.map((persona) => (
                <PersonaHospitalItem
                  key={persona.id}
                  persona={persona}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

export default function CiudadanoView() {
  const { perfil, session, rol } = useAuth()
  const esAdmin = rol === 'admin'
  const { necesidades, acopios, recargarAcopios } = useNecesidades(
    ['sin_verificar', 'verificada', 'en_proceso'],
    undefined,
    // Realtime solo para usuarios con sesión (staff). Los anónimos refrescan
    // por sondeo → no abren websocket → escala a miles a la vez.
    !!session,
  )
  // Total de desaparecidos para el contador del botón. Se difiere (no es
  // crítico para la primera pintada) para no competir con la carga del mapa.
  const [totalDesap, setTotalDesap] = useState<number | null>(null)
  useEffect(() => {
    let cancel = false
    const consultar = () =>
      supabase
        .from('desaparecidos')
        .select('id', { count: 'exact', head: true })
        .eq('estado', 'no_encontrado')
        .not('lat', 'is', null)
        .then(({ count }) => {
          if (!cancel) setTotalDesap(count ?? null)
        })
    const t = window.setTimeout(consultar, 2500)
    return () => {
      cancel = true
      window.clearTimeout(t)
    }
  }, [])
  // La ubicación se detecta sola (GPS/IP) y se refresca cada 10 minutos.
  const { coord: coordAuto, fuente: fuenteAuto } = useUbicacionAuto()
  const { notificar } = useNotificaciones()
  const navigate = useNavigate()
  // Pin a resaltar en el mapa al abrir un enlace compartido.
  const [searchParams, setSearchParams] = useSearchParams()
  const resaltadaId = searchParams.get('necesidad') ?? undefined
  const resaltadaAcopioId = searchParams.get('acopio') ?? undefined
  // El resaltado se quita solo a los 15 s para no quedar fijo.
  useEffect(() => {
    if (!resaltadaId && !resaltadaAcopioId) return
    const t = window.setTimeout(() => {
      setSearchParams(
        (prev) => {
          prev.delete('necesidad')
          prev.delete('acopio')
          return prev
        },
        { replace: true },
      )
    }, 15000)
    return () => window.clearTimeout(t)
  }, [resaltadaAcopioId, resaltadaId, setSearchParams])
  // Voluntario/rescatista/admin pueden tomar una necesidad desde el mapa.
  const puedeAtender = puedeAtenderNecesidades(rol)
  const esRescatista = esRolRescatista(rol)
  const puedeReportarHospital = puedeGestionarComoLider(rol)
  // Solo líder de voluntarios/admin pueden quitar una solicitud del mapa.
  const puedeEliminarDelMapa = puedeGestionarComoLider(rol)
  const puedeCambiarTipo = esAdmin

  // Quitar una necesidad del mapa (borrado suave). Realtime la marca como
  // eliminada y el mapa deja de mostrarla al instante.
  async function eliminarDelMapaHandler(n: Necesidad, motivo: string) {
    try {
      await eliminarDelMapa(n.id, true, motivo)
      notificar('🗑️ Solicitud eliminada del mapa. Queda registrada.', 'exito')
    } catch (e) {
      notificar('No se pudo eliminar: ' + (e as Error).message, 'alerta')
    }
  }

  async function cambiarTipoHandler(n: Necesidad, tipo: NecesidadTipo) {
    if (tipo === n.tipo) return
    try {
      await cambiarTipoNecesidad(n.id, tipo)
      notificar('Tipo de alerta actualizado.', 'exito')
    } catch (e) {
      notificar('No se pudo cambiar el tipo: ' + (e as Error).message, 'alerta')
    }
  }

  // Tomar una necesidad desde el popup del mapa: la pasa a "en proceso" y le
  // avisa (Realtime) a quien la creó que alguien ya va en camino.
  async function asignarme(n: Necesidad) {
    if (n.tipo === 'rescate' && !esRescatista) {
      notificar('Solo los rescatistas pueden tomar una emergencia SOS.', 'alerta')
      return
    }
    const { error } = await supabase
      .from('necesidades')
      .update({ estado: 'en_proceso', asignado_a: perfil?.id ?? null })
      .eq('id', n.id)
      .in('estado', ['sin_verificar', 'verificada'])
    if (error) notificar('No se pudo asignar: ' + error.message, 'alerta')
    else
      notificar(
        '✅ Te asignaste. Avisamos a la persona que estás atendiendo su solicitud.',
        'exito',
      )
  }

  const [tipoFiltro, setTipoFiltro] = useState<FiltroTipo>('todos')
  const [urgFiltro, setUrgFiltro] = useState<NecesidadUrgencia | 'todas'>('todas')
  // El filtro arranca CERRADO para no tapar el mapa; se abre con la flechita.
  const [verFiltros, setVerFiltros] = useState(false)
  // En móvil, el bloque de roles arranca plegado para no tapar el mapa.
  const [verRoles, setVerRoles] = useState(false)
  // Capa de desaparecidos: OCULTA al entrar. Solo se muestra cuando el usuario
  // la activa con el botón 🔍 Desaparecidos. null = aún no ha tocado (oculta).
  const [verDesapManual, setVerDesapManual] = useState<boolean | null>(null)
  const [busqDesap, setBusqDesap] = useState('')
  // Resultados de la búsqueda de desaparecidos: se muestran como LISTA y solo
  // al tocar a una persona se vuela el mapa hasta su punto.
  const [resultadosDesap, setResultadosDesap] = useState<Desaparecido[]>([])
  const [listaDesapVisible, setListaDesapVisible] = useState(false)
  const [hospitalSeleccionado, setHospitalSeleccionado] =
    useState<CentroAcopio | null>(null)
  const [modalPersonasHospitalAbierto, setModalPersonasHospitalAbierto] =
    useState(false)
  const [personasHospital, setPersonasHospital] = useState<PersonaHospital[]>([])
  const [cargandoPersonasHospital, setCargandoPersonasHospital] = useState(false)
  const [irACoordenada, setIrACoordenada] = useState<[number, number] | null>(
    null,
  )
  const [desaparecidoSeleccionadoId, setDesaparecidoSeleccionadoId] =
    useState<string | null>(null)
  // Fecha de la última carga de datos de desaparecidos (scraper_runs). La
  // fuente puso autenticador y el scraper quedó pausado: esto avisa que los
  // datos son un histórico y no se actualizan en vivo.
  const [ultimaCargaDesap, setUltimaCargaDesap] = useState<string | null>(
    null,
  )
  const [abrirReporte, setAbrirReporte] = useState(false)
  const [abrirSos, setAbrirSos] = useState(false)
  const [chatNec, setChatNec] = useState<Necesidad | null>(null)
  const [chatAbierto, setChatAbierto] = useState(() => {
    try {
      return localStorage.getItem('esperanza.chatLateral') !== 'cerrado'
    } catch {
      return true
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(
        'esperanza.chatLateral',
        chatAbierto ? 'abierto' : 'cerrado',
      )
    } catch {
      /* ignorar */
    }
  }, [chatAbierto])

  useEffect(() => {
    if (!modalPersonasHospitalAbierto) return
    const cerrarConEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setModalPersonasHospitalAbierto(false)
    }
    window.addEventListener('keydown', cerrarConEscape)
    return () => window.removeEventListener('keydown', cerrarConEscape)
  }, [modalPersonasHospitalAbierto])

  // Contactar a quien reportó: si hay sesión abre el chat; si no, va al login.
  function contactar(n: Necesidad) {
    if (session) setChatNec(n)
    else navigate('/login')
  }

  // Búsqueda de desaparecidos por nombre → LISTA (con debounce). Solo al tocar a
  // una persona se vuela el mapa hasta su punto.
  useEffect(() => {
    const term = busqDesap.trim()
    if (term.length < 2) {
      setResultadosDesap([])
      return
    }
    let cancel = false
    const t = window.setTimeout(async () => {
      const { data } = await supabase
        .from('desaparecidos')
        .select(
          'id, nombre, edad, genero, fecha_desaparicion, ultima_ubicacion, lat, lng, foto_url, contacto_familiar, estado, fuente, creado_en',
        )
        .eq('estado', 'no_encontrado')
        .ilike('nombre', `%${term}%`)
        .not('lat', 'is', null)
        .limit(50)
      if (!cancel) {
        setResultadosDesap((data ?? []) as Desaparecido[])
        setListaDesapVisible(true)
      }
    }, 300)
    return () => {
      cancel = true
      window.clearTimeout(t)
    }
  }, [busqDesap])

  // Tocar a una persona del listado: vuela el mapa a su punto y cierra la lista.
  function irAPersona(d: Desaparecido) {
    if (d.lat != null && d.lng != null) {
      setVerDesapManual(true)
      setIrACoordenada([d.lat, d.lng])
      setDesaparecidoSeleccionadoId(null)
      window.setTimeout(() => setDesaparecidoSeleccionadoId(d.id), 0)
      setListaDesapVisible(false)
    }
  }
  // El tutorial se muestra automáticamente la primera vez que se abre la app.
  const [abrirTutorial, setAbrirTutorial] = useState(false)

  useEffect(() => {
    try {
      if (!localStorage.getItem(CLAVE_TUTORIAL)) setAbrirTutorial(true)
    } catch {
      /* sin localStorage: no pasa nada */
    }
  }, [])

  function cerrarTutorial() {
    try {
      localStorage.setItem(CLAVE_TUTORIAL, '1')
    } catch {
      /* ignorar */
    }
    setAbrirTutorial(false)
  }

  // Al filtrar por centros (acopio/hospital) no se muestran necesidades.
  const filtrandoCentros = tipoFiltro === 'acopio' || tipoFiltro === 'hospital'

  // Ambos filtros se combinan (tipo Y urgencia).
  const filtradas = useMemo(
    () =>
      filtrandoCentros
        ? []
        : necesidades.filter((n) => {
            if (n.eliminada_del_mapa) return false
            if (!puedeVerNecesidad(n, rol)) return false
            if (tipoFiltro !== 'todos' && n.tipo !== tipoFiltro) return false
            if (urgFiltro !== 'todas' && n.urgencia !== urgFiltro) return false
            return true
          }),
    [necesidades, tipoFiltro, urgFiltro, filtrandoCentros, rol],
  )

  // Los desaparecidos NO se muestran al entrar a la página: quedan ocultos hasta
  // que el usuario pulse el botón 🔍 Desaparecidos (o busque por nombre). Así no
  // tapan las necesidades a primera vista.
  const verDesap = verDesapManual ?? false
  const desapConCoords = totalDesap ?? 0

  // Se consulta UNA sola vez, la primera vez que se abre la capa (no en cada
  // toggle). El scraper (Python, fuera de la web) está PAUSADO: la fuente
  // puso autenticador y no debe volver a correrse; esto solo lee el registro
  // de su última corrida exitosa para avisar que el dato es histórico.
  useEffect(() => {
    if (!verDesap || ultimaCargaDesap !== null) return
    supabase
      .from('scraper_runs')
      .select('finalizado_en, iniciado_en')
      .eq('tipo', 'personas')
      .eq('estado', 'ok')
      .order('finalizado_en', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        setUltimaCargaDesap(
          (data?.finalizado_en as string | undefined) ??
            (data?.iniciado_en as string | undefined) ??
            '',
        )
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verDesap])

  // Centros visibles según el filtro:
  //  · 'todos'    → todos los centros (acopios + hospitales)
  //  · 'acopio'   → solo centros de acopio (no hospitales)
  //  · 'hospital' → solo hospitales
  //  · necesidad  → ninguno (se muestra solo esa necesidad)
  const acopiosVisibles = useMemo(() => {
    const esHosp = (a: CentroAcopio) =>
      (a.descripcion ?? '').toLowerCase().includes('hospital')
    if (tipoFiltro === 'todos') return acopios
    if (tipoFiltro === 'acopio') return acopios.filter((a) => !esHosp(a))
    if (tipoFiltro === 'hospital') return acopios.filter((a) => esHosp(a))
    return []
  }, [acopios, tipoFiltro])
  const necesidadesMapa = verDesap ? [] : filtradas
  const acopiosMapa = verDesap ? [] : acopiosVisibles
  const hayFiltro =
    tipoFiltro !== 'todos' ||
    urgFiltro !== 'todas'

  useEffect(() => {
    if (!modalPersonasHospitalAbierto || !hospitalSeleccionado) {
      setPersonasHospital([])
      setCargandoPersonasHospital(false)
      return
    }

    let cancel = false
    const hospital = hospitalSeleccionado
    const hospitalNormalizado = claveHospitalConsulta(hospital.nombre)

    async function cargarPersonasHospital() {
      setCargandoPersonasHospital(true)

      const { data, error } = await supabase
        .from('personas_hospitalizadas_publicas')
        .select(COLS_PERSONAS_HOSPITAL)
        .eq('estatus', 'HOSPITAL')
        .eq('hospital_normalizado', hospitalNormalizado)
        .order('nombre', { ascending: true })
        .limit(300)

      if (cancel) return

      if (error) {
        console.error('Error cargando personas hospitalizadas', error)
        setPersonasHospital([])
      } else {
        setPersonasHospital(((data ?? []) as PersonaHospitalDB[]).map(adaptarPersonaHospital))
      }

      setCargandoPersonasHospital(false)
    }

    void cargarPersonasHospital()
    return () => {
      cancel = true
    }
  }, [hospitalSeleccionado, modalPersonasHospitalAbierto])

  return (
    <div className="relative h-full w-full md:flex">
      {/* Chat comunitario lateral (solo escritorio; en móvil va en el menú).
          Se puede abrir/cerrar con el botón ✕ de su cabecera. */}
      {chatAbierto && (
        <aside className="hidden md:flex md:w-80 lg:w-96 h-full flex-col border-r border-gray-200 shrink-0">
          <ChatGlobal onCerrar={() => setChatAbierto(false)} />
        </aside>
      )}

      {/* Zona del mapa */}
      <div className="relative flex-1 h-full min-w-0">
        {/* Botón para reabrir el chat (solo escritorio, cuando está cerrado) */}
        {!chatAbierto && (
          <button
            onClick={() => setChatAbierto(true)}
            className="hidden md:flex absolute left-3 bottom-4 z-[1000] items-center gap-2 bg-bandera-azul text-white font-semibold px-4 py-2.5 rounded-full shadow-lg"
          >
            💬 Chat en vivo
          </button>
        )}
        <div className="absolute inset-0">
          <MapaNecesidades
            necesidades={necesidadesMapa}
            acopios={acopiosMapa}
            miUbicacion={coordAuto}
            miFoto={perfil?.foto_url}
            onMensaje={contactar}
            onAsignarme={puedeAtender ? asignarme : undefined}
            onEliminarDelMapa={
              puedeEliminarDelMapa ? eliminarDelMapaHandler : undefined
            }
            onCambiarTipo={puedeCambiarTipo ? cambiarTipoHandler : undefined}
            puedeVerContacto={puedeAtender}
            resaltadaId={resaltadaId}
            resaltadaAcopioId={resaltadaAcopioId}
            verDesaparecidos={verDesap}
            busquedaDesap={busqDesap}
            irACoordenada={irACoordenada}
            desaparecidoResaltadoId={desaparecidoSeleccionadoId}
            onHospitalSeleccionado={(hospital) => {
              setTipoFiltro('hospital')
              setHospitalSeleccionado(hospital)
              setModalPersonasHospitalAbierto(true)
            }}
          />
          {/* (desaparecidos se cargan por zona dentro del mapa) */}
        </div>

        {/* Encabezado + filtros */}
        <div
          className="absolute top-0 left-0 right-0 z-[1000] p-3 pointer-events-none"
          data-map-overlay="top"
        >
          <div className="flex items-center gap-2 mb-2 pointer-events-auto">
            <span className="bg-bandera-azul text-white font-extrabold px-3 py-2 rounded-xl shadow">
              🕊️ Esperanza
            </span>
            <button
              onClick={() => setAbrirTutorial(true)}
              className="flex items-center gap-1.5 bg-bandera-amarillo text-white font-bold px-3 py-2 rounded-xl shadow-md text-sm hover:brightness-105 active:scale-95 transition"
            >
              <span className="grid place-items-center h-5 w-5 rounded-full bg-white/25 text-[13px] leading-none animate-pulse">
                💡
              </span>
              ¿Cómo funciona?
            </button>
            <div className="ml-auto flex items-center gap-2">
              {session && <CampanaNotificaciones claro />}
              <MenuUsuario claro />
            </div>
          </div>

          {/* Accesos directos por rol (solo si no hay sesión): entra o crea
              cuenta ya con el rol elegido. Plegable para no tapar el mapa. */}
          {!session && (
            <div className="pointer-events-auto bg-white/95 backdrop-blur rounded-2xl shadow mb-2">
              <button
                onClick={() => setVerRoles((v) => !v)}
                className="w-full flex items-center justify-between px-3 py-2.5"
              >
                <span className="text-sm font-bold text-gray-700">
                  👤 Entra o crea tu cuenta
                </span>
                <span className="text-gray-400 text-lg leading-none">
                  {verRoles ? '▲' : '▼'}
                </span>
              </button>
              {verRoles && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 px-2 pb-2">
                  {ROLES_ACCESO.map((r) => (
                    <button
                      key={r}
                      onClick={() => navigate(`/login?rol=${r}`)}
                      className="flex items-center justify-center gap-1.5 text-sm font-semibold rounded-xl px-2 py-2 bg-bandera-azul/10 text-bandera-azul hover:bg-bandera-azul/20 active:scale-95 transition"
                    >
                      <span className="text-base leading-none">
                        {ROL_META[r].emoji}
                      </span>
                      {ROL_META[r].etiqueta}
                    </button>
                  ))}
                  {/* Psicólogo/a NO es un rol que se autoasigne al entrar: es
                      una solicitud que revisa el equipo. Por eso va aparte y
                      lleva directo al registro con el pedido preactivado. */}
                  <button
                    onClick={() => navigate('/registro?psicologo=1')}
                    className="flex items-center justify-center gap-1.5 text-sm font-semibold rounded-xl px-2 py-2 bg-purple-100 text-purple-800 hover:bg-purple-200 active:scale-95 transition"
                  >
                    <span className="text-base leading-none">🧠</span>
                    Psicólogo/a
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Controles compactos: una sola fila con Filtrar + Desaparecidos,
              para no saturar la pantalla (sobre todo en el teléfono). */}
          <div className="pointer-events-auto flex gap-2">
            <button
              onClick={() => setVerFiltros((v) => !v)}
              className={`flex-1 flex items-center justify-center gap-1.5 rounded-2xl shadow px-2 py-2.5 text-xs sm:text-sm font-bold whitespace-nowrap ${
                verFiltros || hayFiltro
                  ? 'bg-bandera-azul text-white'
                  : 'bg-white/95 backdrop-blur text-gray-700'
              }`}
            >
              🔎 Filtrar{hayFiltro ? ' •' : ''}
              <span className="text-[10px] leading-none">{verFiltros ? '▲' : '▼'}</span>
            </button>
            <button
              onClick={() => {
                const nuevo = !verDesap
                setVerDesapManual(nuevo)
                if (!nuevo) setBusqDesap('')
              }}
              className={`flex-1 flex items-center justify-center gap-1.5 rounded-2xl shadow px-2 py-2.5 text-xs sm:text-sm font-bold whitespace-nowrap ${
                verDesap
                  ? 'bg-bandera-azul text-white'
                  : 'bg-white/95 backdrop-blur text-gray-700'
              }`}
            >
              🔍 Desaparecidos{desapConCoords ? ` (${desapConCoords})` : ''}
            </button>
          </div>

          {/* Panel de filtros (solo si está abierto) */}
          {verFiltros && (
            <div className="pointer-events-auto bg-white/95 backdrop-blur rounded-2xl shadow p-2 mt-2">
              <div className="grid grid-cols-2 gap-2">
                <select
                  className="w-full rounded-lg border-2 border-gray-200 px-2 py-2 text-sm font-medium"
                  value={tipoFiltro}
                  onChange={(e) => setTipoFiltro(e.target.value as FiltroTipo)}
                >
                  <option value="todos">🗂️ Todo tipo de ayuda</option>
                  {TIPOS_FILTRO.filter((t) =>
                    t === 'atencion_psicologica' ? esRolPsicologia(rol) : true,
                  ).map((t) => (
                    <option key={t} value={t}>
                      {TIPO_META[t].emoji} {TIPO_META[t].etiqueta}
                    </option>
                  ))}
                  <option value="hospital">🏥 Hospital</option>
                </select>
                <select
                  className="w-full rounded-lg border-2 border-gray-200 px-2 py-2 text-sm font-medium"
                  value={urgFiltro}
                  onChange={(e) =>
                    setUrgFiltro(e.target.value as NecesidadUrgencia | 'todas')
                  }
                >
                  <option value="todas">⏱️ Cualquier urgencia</option>
                  <option value="alta">🔴 Urgencia alta</option>
                  <option value="media">🟠 Urgencia media</option>
                  <option value="baja">🟢 Urgencia baja</option>
                </select>
              </div>
              {hayFiltro && (
                <button
                  onClick={() => {
                    setTipoFiltro('todos')
                    setUrgFiltro('todas')
                  }}
                  className="mt-2 text-xs text-bandera-rojo font-semibold"
                >
                  ✕ Quitar filtros
                </button>
              )}
            </div>
          )}

          {/* Buscador de desaparecidos (solo si la capa está visible) */}
          {verDesap && (
            <div className="pointer-events-auto bg-white/95 backdrop-blur rounded-2xl shadow p-2 mt-2">
              <a
                href="https://tebusco.app/"
                target="_blank"
                rel="noopener noreferrer"
                className="mb-2 flex items-center gap-3 rounded-2xl border-2 border-bandera-azul/15 bg-white px-3 py-2.5 no-underline shadow-sm hover:border-bandera-azul/30 hover:bg-bandera-azul/5"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-bandera-azul text-white text-lg shadow-sm">
                  🔎
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[11px] font-extrabold uppercase text-bandera-rojo tracking-wide">
                    Alianza activa
                  </span>
                  <span className="block text-sm font-extrabold text-bandera-azul leading-tight">
                    Busca tambien en Tebusco.app
                  </span>
                  <span className="block text-xs font-medium text-gray-600 leading-snug">
                    Plataforma aliada para ampliar la busqueda de personas desaparecidas.
                  </span>
                </span>
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-bandera-amarillo text-white text-base font-black" aria-hidden="true">
                  ↗
                </span>
              </a>
              {ultimaCargaDesap && (
                <p className="mb-2 text-[11px] text-gray-500 text-center">
                  Datos históricos al{' '}
                  {new Date(ultimaCargaDesap).toLocaleDateString('es-VE', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  })}
                  . La fuente ahora exige acceso autenticado: verifica en el
                  sitio oficial si buscas información más reciente.
                </p>
              )}
              <input
                type="search"
                value={busqDesap}
                onChange={(e) => {
                  setBusqDesap(e.target.value)
                  setDesaparecidoSeleccionadoId(null)
                  setListaDesapVisible(true)
                }}
                placeholder="Buscar desaparecido por nombre…"
                className="w-full rounded-lg border-2 border-gray-200 px-2 py-2 text-sm"
              />
              {/* Listado de coincidencias: se elige una persona ANTES de ir al
                  mapa. Al tocarla, el mapa vuela hasta su punto. */}
              {listaDesapVisible && busqDesap.trim().length >= 2 && (
                <div className="mt-2 max-h-72 overflow-y-auto rounded-lg border border-gray-100">
                  {resultadosDesap.length === 0 ? (
                    <p className="text-xs text-gray-500 p-3 text-center">
                      Sin coincidencias por ese nombre.
                    </p>
                  ) : (
                    <ul className="divide-y divide-gray-100">
                      {resultadosDesap.map((d) => (
                        <li key={d.id}>
                          <button
                            onClick={() => irAPersona(d)}
                            className="w-full flex items-center gap-2 p-2 text-left hover:bg-gray-50"
                          >
                            {d.foto_url ? (
                              <img
                                src={d.foto_url}
                                alt={d.nombre}
                                loading="lazy"
                                className="h-10 w-10 rounded-full object-cover border border-gray-200 shrink-0"
                                onError={(e) => {
                                  ;(e.currentTarget as HTMLImageElement).style.display =
                                    'none'
                                }}
                              />
                            ) : (
                              <span className="h-10 w-10 rounded-full bg-gray-100 grid place-items-center shrink-0">
                                {d.estado === 'encontrado' ? '✅' : '🔍'}
                              </span>
                            )}
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-semibold text-gray-800 truncate">
                                {d.nombre}
                              </span>
                              <span className="block text-xs text-gray-500 truncate">
                                {[
                                  d.edad ? `${d.edad} años` : null,
                                  d.ultima_ubicacion,
                                ]
                                  .filter(Boolean)
                                  .join(' · ') || 'Ver en el mapa'}
                              </span>
                            </span>
                            <span className="text-bandera-azul text-sm shrink-0">
                              📍
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Botones flotantes: SOS + Reportar */}
        <div
          className="absolute bottom-4 left-0 right-0 z-[1000] px-4 pointer-events-none"
          data-map-overlay="bottom"
        >
          <div className="mx-auto w-full max-w-md flex flex-col gap-2 pointer-events-auto">
            <button
              onClick={() => setAbrirSos(true)}
              className="btn-rojo w-full text-base sm:text-lg py-3.5 animate-pulse"
            >
              🆘 SOS / Necesito rescate
            </button>
            <button
              onClick={() => setAbrirReporte(true)}
              className="btn-azul w-full text-base sm:text-lg py-3.5"
            >
              ➕ Reportar necesidad
            </button>
          </div>
        </div>
      </div>

      {modalPersonasHospitalAbierto && hospitalSeleccionado && (
        <PersonasHospitalModal
          hospital={hospitalSeleccionado}
          personas={personasHospital}
          cargando={cargandoPersonasHospital}
          onCerrar={() => setModalPersonasHospitalAbierto(false)}
        />
      )}

      {abrirReporte && (
        <ReportarModal
          coordInicial={coordAuto}
          fuenteInicial={fuenteAuto}
          puedeReportarHospital={puedeReportarHospital}
          puedeReportarZonaAislada={esAdmin || rol === 'lider_voluntarios'}
          onCerrar={() => setAbrirReporte(false)}
          onCreado={(tipo) => {
            setAbrirReporte(false)
            notificar(
              tipo === 'hospital'
                ? 'Hospital registrado correctamente. Gracias por ayudar a mantener la información actualizada.'
                : tipo === 'atencion_psicologica'
                  ? 'Solicitud creada. Gracias por confiar en la red: el equipo psicológico revisará tu caso y te contactará lo antes posible.'
                  : 'Reporte creado correctamente. Gracias por avisar: el equipo revisará la solicitud y te contactará lo antes posible.',
              'exito',
            )
            if (tipo === 'hospital') {
              setTipoFiltro('hospital')
              void recargarAcopios()
            }
          }}
        />
      )}
      {abrirSos && <SosModal onCerrar={() => setAbrirSos(false)} />}
      {abrirTutorial && <TutorialModal onCerrar={cerrarTutorial} />}
      {chatNec && (
        <ChatNecesidad
          necesidadId={chatNec.id}
          titulo={`${TIPO_META[chatNec.tipo].etiqueta}${
            chatNec.zona ? ' · ' + chatNec.zona : ''
          }`}
          onCerrar={() => setChatNec(null)}
        />
      )}
    </div>
  )
}
