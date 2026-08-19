import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Siren,
  MessageSquarePlus,
  Heart,
  SlidersHorizontal,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  BadgeCheck,
  Check,
  UserSearch,
  MapPin,
  Search,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import MapaNecesidades from '../components/MapaNecesidades'
import CampanaNotificaciones from '../components/CampanaNotificaciones'
import ReportarModal from '../components/ReportarModal'
import SosModal from '../components/SosModal'
import OfertaModal from '../components/OfertaModal'
import AvisosEnVivo from '../components/AvisosEnVivo'
import ChatGlobal from '../components/ChatGlobal'
import ChatNecesidad from '../components/ChatNecesidad'
import TutorialModal from '../components/TutorialModal'
import MenuUsuario from '../components/MenuUsuario'
import Paloma from '../components/Paloma'
import { useNecesidades } from '../hooks/useNecesidades'
import {
  cambiarTipoNecesidad,
  eliminarDelMapa,
  verificarNecesidad,
  verificarNecesidadComoEntidad,
} from '../lib/reportes'
import { tengoEntidadVigente } from '../lib/entidades'
import { nombresPublicos } from '../lib/perfiles'
import { geocodificarDireccion, VISTA_PAIS_DESAP } from '../lib/geo'
import {
  esRolEntidad,
  esRolRescatista,
  puedeAtenderNecesidades,
  puedeGestionarComoLider,
  puedeVerNecesidad,
  puedeVerificarNecesidad,
  puedeVerificarTodo,
} from '../lib/roles'
import type { Desaparecido } from '../hooks/useDesaparecidos'
import { useEncontrados } from '../hooks/useEncontrados'
import { useUbicacionAuto } from '../hooks/useUbicacionAuto'
import { useAuth } from '../context/AuthContext'
import { useNotificaciones } from '../context/NotificacionesContext'
import {
  TIPO_META,
  TIPOS_PELIGRO,
  type Necesidad,
  type CentroAcopio,
  type NecesidadTipo,
  type NecesidadUrgencia,
} from '../lib/types'

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
  // Ids de perfil (asignado_a) verificados por una entidad (migración 64):
  // sus necesidades muestran un anillo celeste en el pin del mapa.
  const [idsVerificados, setIdsVerificados] = useState<Set<string>>(new Set())
  useEffect(() => {
    const ids = [...new Set(necesidades.map((n) => n.asignado_a).filter(Boolean))]
    if (ids.length === 0) return
    nombresPublicos(ids).then((m) => {
      setIdsVerificados(
        new Set(
          [...m.values()]
            .filter((p) => p.verificado_entidad_id)
            .map((p) => p.id),
        ),
      )
    })
  }, [necesidades])
  // País de la capa de desaparecidos. Colombia por defecto (emergencia
  // activa ahora mismo, igual que el resto de la app); null = todos los
  // países mezclados (lo que esté a la vista en el mapa). Se puede cambiar
  // libremente con los botones o volviendo a tocar el país ya elegido.
  const [paisDesap, setPaisDesap] = useState<string | null>('Colombia')
  // Vista a la que "vuela" el mapa al elegir un país (si no, el filtro
  // queda aplicado pero el mapa se queda donde estaba, y como el punto
  // puede estar del otro lado del continente el marcador "desaparece" sin
  // que en realidad se haya ido a ningún lado).
  const [vistaPaisDesap, setVistaPaisDesap] = useState<
    { lat: number; lng: number; zoom: number } | null
  >(null)
  function elegirPaisDesap(p: string) {
    setPaisDesap(p)
    // Además de filtrar, hay que mover el mapa: si no, el filtro queda bien
    // puesto pero la vista sigue en el país anterior y parece que no hay
    // nadie (los puntos están a miles de km, fuera de la zona consultada).
    const vista = VISTA_PAIS_DESAP[p]
    if (vista) setVistaPaisDesap(vista)
  }
  // Persona o mascota en la capa de Desaparecidos: null = ambos mezclados.
  const [tipoSerDesap, setTipoSerDesap] = useState<'persona' | 'mascota' | null>(
    null,
  )
  // Total de desaparecidos para el contador del botón. Se difiere (no es
  // crítico para la primera pintada) para no competir con la carga del mapa.
  const [totalDesap, setTotalDesap] = useState<number | null>(null)
  // Cuántos hay en el trozo de mapa que se está viendo y cuántos se pintaron.
  // El contador del botón cuenta TODO el país, así que sin esto el número
  // nunca cuadraba con las burbujas y parecía un error.
  const [desapZona, setDesapZona] = useState<{
    enZona: number | null
    paginas: number
    desde: number
    hasta: number
  } | null>(null)
  const [paginaDesap, setPaginaDesap] = useState(0)
  // Ver solo los reportes que traen documento oficial. La fuente lo publica
  // enmascarado, así que no sirve para identificar a nadie — sirve para saber
  // qué parte de la lista está respaldada por un papel y no solo por un
  // nombre.
  const [soloConDoc, setSoloConDoc] = useState(false)
  useEffect(() => {
    let cancel = false
    const consultar = () => {
      let q = supabase
        .from('desaparecidos')
        .select('id', { count: 'exact', head: true })
        .eq('estado', 'no_encontrado')
        .not('lat', 'is', null)
      if (paisDesap) q = q.eq('pais', paisDesap)
      if (tipoSerDesap) q = q.eq('tipo_ser', tipoSerDesap)
      return q.then(({ count }) => {
        if (!cancel) setTotalDesap(count ?? null)
      })
    }
    const t = window.setTimeout(consultar, 2500)
    return () => {
      cancel = true
      window.clearTimeout(t)
    }
  }, [paisDesap, tipoSerDesap])
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
  // Verificar es dar una insignia de confianza, así que la da el equipo de
  // coordinación: líderes, verificador y admin. Un voluntario atiende, pero
  // no acredita. (Las migraciones 79/83/85 lo exigen también en la base.)
  // Quién puede poner la estrella: los tres roles de coordinación (líder de
  // voluntarios, líder de acopios y admin) más el verificador, que existe
  // justamente para esto. Un voluntario ATIENDE, pero no acredita.
  //
  // Desde la migración 85 se suma la ENTIDAD aprobada, pero solo en los
  // reportes de mascotas: ya pasó por el filtro de un administrador y está
  // en terreno, así que se le confía lo suyo y nada más.
  const [entidadVigente, setEntidadVigente] = useState(false)
  useEffect(() => {
    if (!esRolEntidad(rol)) {
      setEntidadVigente(false)
      return
    }
    let vivo = true
    tengoEntidadVigente()
      .then((v) => {
        if (vivo) setEntidadVigente(v)
      })
      // Si falla la consulta simplemente no se muestra el botón: la base
      // valida igual, y un mapa que no carga por esto sería mucho peor.
      .catch(() => {
        if (vivo) setEntidadVigente(false)
      })
    return () => {
      vivo = false
    }
  }, [rol])

  const puedeVerificar = puedeVerificarTodo(rol) || entidadVigente
  const verificablePorMi = (n: Necesidad) =>
    puedeVerificarNecesidad(n, rol, entidadVigente)

  async function verificarHandler(n: Necesidad, verificar: boolean) {
    try {
      // La entidad va por su propia función en la base: el rol 'entidad' no
      // está en la política de UPDATE, así que un update directo suyo no
      // tocaría nada.
      if (puedeVerificarTodo(rol)) {
        await verificarNecesidad(n.id, verificar)
      } else {
        await verificarNecesidadComoEntidad(n.id, verificar)
      }
      notificar(
        verificar
          ? '★ Reporte verificado: ya se ve con aura celeste en el mapa.'
          : 'Se quitó la verificación del reporte.',
        'exito',
      )
    } catch (e) {
      notificar((e as Error).message, 'alerta')
    }
  }

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
  // El SOS late solo al entrar, para que salte a la vista. Latir sin parar
  // cansa y termina ignorándose, que es justo lo contrario de lo que busca.
  const [pulsoSos, setPulsoSos] = useState(true)
  useEffect(() => {
    const t = window.setTimeout(() => setPulsoSos(false), 8000)
    return () => window.clearTimeout(t)
  }, [])
  // Buscador de direcciones dentro del panel de Filtrar: vuela el mapa al
  // punto encontrado (mismo mecanismo que "ir a persona" de desaparecidos).
  const [buscarDireccionTexto, setBuscarDireccionTexto] = useState('')
  const [buscandoDireccion, setBuscandoDireccion] = useState(false)
  const [errorBuscarDireccion, setErrorBuscarDireccion] = useState('')
  // Capa de desaparecidos: OCULTA al entrar. Solo se muestra cuando el usuario
  // la activa con el botón 🔍 Desaparecidos. null = aún no ha tocado (oculta).
  const [verDesapManual, setVerDesapManual] = useState<boolean | null>(null)

  // Qué capas se ven. "Yo tengo" arranca APAGADA: el mapa no debe llenarse
  // solo, y quien no la pide tampoco paga la consulta. Son interruptores
  // independientes y no un selector de una sola opción, porque pedir ayuda y
  // avisar de un peligro se miran juntos: quien busca a alguien necesita ver
  // también qué edificio se cayó.
  // "Yo tengo" arranca ENCENDIDA desde que contiene los centros de acopio.
  // Cuando solo tenía las ofertas nuevas venía apagada para no llenar el mapa
  // solo, pero los acopios ya existen y se veían siempre: dejarla apagada
  // habría hecho desaparecer ~156 centros de la vista inicial sin que nadie
  // lo pidiera.
  const [capas, setCapas] = useState({
    necesito: true,
    peligro: true,
    tengo: true,
    mascotas: true,
  })
  const [ofertaAbierta, setOfertaAbierta] = useState(false)
  // Filtro de calidad, no de categoría: deja solo lo que el equipo
  // confirmó que es real. Apagado por defecto — encenderlo de entrada
  // escondería casi todo el mapa.
  const [soloVerificados, setSoloVerificados] = useState(false)
  const [busqDesap, setBusqDesap] = useState('')

  // Capa de YA LOCALIZADOS. Se SUMA a la de desaparecidos, no la reemplaza:
  // son dos preguntas distintas ("¿a quién buscamos?" y "¿a quién ya
  // encontramos?") y quien mira una puede querer mirar la otra.
  // Es una lista y no marcadores porque los localizados no tienen
  // coordenadas: el scraper se las borra al encontrarlos (ver useEncontrados).
  const [verEncontrados, setVerEncontrados] = useState(false)
  // Menú del botón Desaparecidos (Ver / Ingresar) y alta directa.
  const [menuDesap, setMenuDesap] = useState(false)
  const [abrirDesapNuevo, setAbrirDesapNuevo] = useState(false)
  // El panel de desaparecidos arranca ABIERTO al encender la capa (es lo que
  // se vino a hacer), pero se puede plegar a solo su barra para recuperar el
  // mapa sin apagar la búsqueda.
  const [panelDesapAbierto, setPanelDesapAbierto] = useState(true)
  const {
    encontrados,
    total: totalEncontrados,
    cargando: cargandoEncontrados,
  } = useEncontrados(verEncontrados, {
    busqueda: busqDesap,
    pais: paisDesap,
    tipoSer: tipoSerDesap,
  })
  // Volver a la página 1 al cambiar lo que se mira. Sin esto uno podía quedar
  // en la "página 4" de una zona que ya no tiene tantos y ver el mapa vacío
  // sin entender por qué.
  useEffect(() => {
    setPaginaDesap(0)
  }, [paisDesap, tipoSerDesap, busqDesap, soloConDoc])
  // Y si al mover el mapa la zona nueva tiene menos páginas, uno se quedaría
  // en una que ya no existe: mapa vacío y flechas muertas. Esto lo corrige
  // solo, sin tener que avisar desde el mapa cada vez que se desplaza.
  useEffect(() => {
    if (desapZona && paginaDesap >= desapZona.paginas) setPaginaDesap(0)
  }, [desapZona, paginaDesap])
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
      let q = supabase
        .from('desaparecidos')
        .select(
          'id, nombre, edad, genero, fecha_desaparicion, ultima_ubicacion, lat, lng, foto_url, contacto_familiar, estado, fuente, creado_en, pais, tipo_ser',
        )
        .eq('estado', 'no_encontrado')
        .ilike('nombre', `%${term}%`)
        .not('lat', 'is', null)
        .limit(50)
      if (paisDesap) q = q.eq('pais', paisDesap)
      if (tipoSerDesap) q = q.eq('tipo_ser', tipoSerDesap)
      const { data } = await q
      if (!cancel) {
        setResultadosDesap((data ?? []) as Desaparecido[])
        setListaDesapVisible(true)
      }
    }, 300)
    return () => {
      cancel = true
      window.clearTimeout(t)
    }
  }, [busqDesap, paisDesap, tipoSerDesap])

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

  // Buscador de direcciones del panel "Filtrar": geocodifica lo escrito y
  // vuela el mapa hasta ahí (sin restricción de país: la red ya es global).
  async function buscarDireccionEnMapa(e: React.FormEvent) {
    e.preventDefault()
    const dir = buscarDireccionTexto.trim()
    if (!dir) return
    setErrorBuscarDireccion('')
    setBuscandoDireccion(true)
    const g = await geocodificarDireccion(dir, { pais: '', cc: '' })
    setBuscandoDireccion(false)
    if (g) {
      setIrACoordenada([g.lat, g.lng])
    } else {
      setErrorBuscarDireccion('No encontramos esa dirección en el mapa.')
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
  // "Aviso de peligro" no es una tabla aparte: son los tipos de necesidad que
  // avisan de un riesgo en vez de pedir un recurso. Separarlos en la interfaz
  // es lo que permite mirar solo los peligros sin el ruido de los pedidos.
  // Cada reporte cae en UNA sola de las tres casillas, y cada casilla tiene su
  // interruptor. Así "Mascotas" se puede mirar sola —o apagar— sin tocar el
  // resto, que es lo que se pidió: todo lo de animales junto y aparte.
  const porCapa = useMemo(() => {
    // "Solo verificados" MANDA SOBRE LAS CATEGORÍAS, no se suma a ellas.
    // Al encenderlo se ven TODOS los verificados —necesito, peligro,
    // mascotas, lo que sea—, porque la pregunta que se está haciendo ya no
    // es "¿de qué tipo?" sino "¿qué está confirmado?". Combinarlo con las
    // cuatro casillas escondía verificados solo porque su categoría estaba
    // apagada, que era justo lo contrario de lo que se pedía.
    // ESTRICTO: solo `verificada`. Se probó contar también "en proceso" y
    // "resuelta" —para atenderlas alguien tuvo que darlas por buenas— pero
    // eso diluye lo único que la estrella promete: que un líder la confirmó.
    // Que el mapa quede vacío cuando no hay ninguna verificada es la
    // respuesta correcta, no un error.
    if (soloVerificados) {
      return filtradas.filter((n) => n.estado === 'verificada')
    }
    return filtradas.filter((n) => {
      if (n.tipo === 'mascota') return capas.mascotas
      if (TIPOS_PELIGRO.has(n.tipo)) return capas.peligro
      return capas.necesito
    })
  }, [filtradas, capas.necesito, capas.peligro, capas.mascotas, soloVerificados])

  const necesidadesMapa = verDesap ? [] : porCapa

  // Los centros de acopio son "Yo tengo": un lugar donde HAY cosas, no donde
  // faltan. Los que atienden animales salen además con "Mascotas", porque
  // pertenecen a las dos miradas y quien busca ayuda para su perro no debería
  // tener que adivinar en cuál de las dos está.
  //
  // Los HOSPITALES viven en la misma tabla pero no se tocan: no son una
  // oferta que alguien publicó, son infraestructura, y esconderlos detrás de
  // un filtro en plena emergencia sería un retroceso.
  const acopiosMapa = useMemo(() => {
    if (verDesap) return []
    // Con "solo verificados" no van: un centro de acopio no se verifica, así
    // que dejarlos visibles rompería la promesa de que TODO lo que se ve en
    // el mapa está confirmado.
    if (soloVerificados) return []
    return acopiosVisibles.filter((a) => {
      const esHospital =
        a.es_hospital || (a.descripcion ?? '').toLowerCase().includes('hospital')
      if (esHospital) return true
      if (a.atiende_animales) return capas.tengo || capas.mascotas
      return capas.tengo
    })
  }, [verDesap, acopiosVisibles, capas.tengo, capas.mascotas, soloVerificados])
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
            onVerificar={puedeVerificar ? verificarHandler : undefined}
            puedeVerificarNecesidad={verificablePorMi}
            idsAsignadoVerificado={idsVerificados}
            puedeVerContacto={puedeAtender}
            resaltadaId={resaltadaId}
            resaltadaAcopioId={resaltadaAcopioId}
            verDesaparecidos={verDesap}
            // Las ofertas tampoco se verifican, asi que con la estrella encendida
            // no se muestran.
            verOfertas={capas.tengo && !soloVerificados}
            // Las de animales salen tambien con el filtro de Mascotas.
            verOfertasMascotas={capas.mascotas && !soloVerificados}
            busquedaDesap={busqDesap}
            paisDesap={paisDesap}
            tipoSerDesap={tipoSerDesap}
            irACoordenada={irACoordenada}
            vistaPaisDesap={vistaPaisDesap}
            desaparecidoResaltadoId={desaparecidoSeleccionadoId}
            // Tocar el mapa cierra el panel de filtros, que en el teléfono
            // tapa media pantalla.
            onTocarMapa={() => setVerFiltros(false)}
            paginaDesap={paginaDesap}
            soloConDocumentoDesap={soloConDoc}
            onDesapEnZona={setDesapZona}
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
          {/* Marca + Filtrar en la misma fila: usa mejor el espacio de arriba.
              Desaparecidos queda dentro del panel (no tapa la parte de arriba). */}
          <div className="flex items-center gap-2 mb-2 pointer-events-auto">
            {/* Cromo oscuro: enmarca sin competir con el mapa, y le da a la
                app el aire de herramienta profesional. El contenido que se
                lee (mapa, formularios) se queda en claro. */}
            <span className="inline-flex items-center gap-2 bg-tinta-900 text-white font-extrabold px-3 py-2 rounded-xl shadow-media whitespace-nowrap text-sm sm:text-base">
              <Paloma className="h-5 w-5 text-white" />
              Red de Esperanza
            </span>
            <button
              onClick={() => setVerFiltros((v) => !v)}
              className={`flex items-center justify-center gap-1.5 rounded-2xl shadow px-2 py-2.5 text-xs sm:text-sm font-bold whitespace-nowrap ${
                verFiltros || hayFiltro
                  ? 'bg-bandera-azul text-white'
                  : 'bg-white/95 backdrop-blur text-gray-700'
              }`}
            >
              <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
              Filtrar{hayFiltro ? ' •' : ''}
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform duration-200 ${
                  verFiltros ? 'rotate-180' : ''
                }`}
                aria-hidden="true"
              />
            </button>
            <div className="ml-auto flex items-center gap-2">
              {session && <CampanaNotificaciones claro />}
              <MenuUsuario claro />
            </div>
          </div>

          {/* El acceso "Entra o crea tu cuenta" se retiró de aquí: el botón
              ❤️ Ayudar de la barra inferior ya cumple ese rol. Iniciar sesión
              sigue disponible desde el menú de usuario (arriba a la derecha). */}

          {/* Filtros y capa de desaparecidos en UNA sola tarjeta.
              Antes eran dos tarjetas apiladas, cada una con su padding,
              sombra y margen: solo el cromo repetido costaba ~24px de mapa.
              Se muestra si hay filtros abiertos O la capa encendida, así
              cerrar "Filtrar" no te deja sin el buscador de desaparecidos. */}
          {verFiltros && (
            <div className="pointer-events-auto bg-white/95 backdrop-blur rounded-2xl shadow p-2 mt-2">
              {/* Qué se ve en el mapa. Van dentro de la tarjeta que ya existía
                  en vez de una barra propia: sumar otra franja fija habría
                  costado mapa, que es lo que la gente vino a mirar. */}
              {/* Dos por fila y no cuatro: a 320 px, cuatro columnas dejan
                  botones de 66 px donde "Mascotas" se parte en dos lineas.
                  Grandes y de a dos se leen sin esfuerzo, que es el punto. */}
              {/* `relative` + gap más ancho: la estrella de "verificados" va
                  ANCLADA AL CENTRO exacto de los cuatro, en el cruce. Como el
                  contenido de cada botón está centrado, el círculo solo tapa
                  las esquinas interiores, que están vacías. */}
              <div className="relative grid grid-cols-2 gap-3 mb-1.5">
                {(
                  [
                    // 🙋 y no 🆘: el botón SOS ya usa 🆘, y repetirlo aquí
                    // hacía pensar que este filtro tenía que ver con el SOS.
                    ['necesito', '🙋', 'Necesito'],
                    ['peligro', '⚠️', 'Peligro'],
                    ['tengo', '🤝', 'Yo tengo'],
                    ['mascotas', '🐾', 'Mascotas'],
                  ] as const
                ).map(([clave, emoji, etiqueta]) => {
                  const activa = capas[clave]
                  return (
                    <button
                      key={clave}
                      onClick={() =>
                        setCapas((c) => ({ ...c, [clave]: !c[clave] }))
                      }
                      aria-pressed={activa}
                      className={`rounded-lg border-2 px-1 py-3 text-sm font-bold flex items-center justify-center gap-1.5 ${
                        activa
                          ? 'bg-bandera-azul/10 border-bandera-azul text-bandera-azul'
                          : 'border-gray-200 text-gray-500'
                      }`}
                    >
                      <span className="text-lg leading-none">{emoji}</span>
                      {etiqueta}
                    </button>
                  )
                })}

                {/* La estrella, justo en el cruce de los cuatro. Lleva un aro
                    blanco grueso para que se lea como una pieza aparte y no
                    como un pedazo de los botones que hay debajo. */}
                <button
                  onClick={() => setSoloVerificados((v) => !v)}
                  aria-pressed={soloVerificados}
                  aria-label="Ver solo reportes verificados"
                  title="Ver solo reportes verificados"
                  className={`absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 grid h-11 w-11 place-items-center rounded-full border-4 border-white text-lg shadow-md transition-colors ${
                    soloVerificados
                      ? 'bg-sky-400 text-white'
                      : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                  }`}
                >
                  {soloVerificados ? '★' : '☆'}
                </button>
              </div>

              {/* Al encenderlo se dice en palabras, porque una estrella sola
                  no explica qué hizo. Solo aparece si está activo, así que no
                  ocupa sitio el resto del tiempo. */}
              {soloVerificados && (
                <p className="mb-1.5 text-center text-[11px] font-bold text-sky-700">
                  {porCapa.length > 0 ? (
                    <>★ Mostrando {porCapa.length} reporte
                    {porCapa.length === 1 ? '' : 's'} verificado
                    {porCapa.length === 1 ? '' : 's'}</>
                  ) : (
                    // Un mapa vacío sin explicación se lee como que algo se
                    // rompió. Aquí se dice que no hay ninguno todavía y quién
                    // los marca, que es lo que resuelve la duda.
                    <>★ Todavía no hay reportes verificados. Los marca el
                    equipo de coordinación con la estrella.</>
                  )}
                </p>
              )}
              {/* Se quitó el desplegable "Todo tipo de ayuda": los cuatro
                  botones de arriba ya dicen qué se ve, y una lista de catorce
                  tipos encima era pedirle a la persona que eligiera dos veces
                  lo mismo. El estado `tipoFiltro` sigue existiendo porque el
                  mapa lo usa al tocar un hospital.
                  El botón de Desaparecidos se mudó abajo, junto a SOS y
                  Reportar: buscar a alguien es de lo primero que hace la gente
                  y estaba escondido detrás de "Filtrar". */}
              <select
                className="w-full rounded-lg border-2 border-gray-200 px-2 py-1.5 text-sm font-medium mt-1.5"
                value={urgFiltro}
                onChange={(e) =>
                  setUrgFiltro(e.target.value as NecesidadUrgencia | 'todas')
                }
              >
                <option value="todas">Cualquier urgencia</option>
                <option value="alta">Urgencia alta</option>
                <option value="media">Urgencia media</option>
                <option value="baja">Urgencia baja</option>
              </select>

              {/* Buscador de direcciones: vuela el mapa al punto encontrado. */}
              {/* Sin etiqueta encima: el icono + el placeholder ya dicen qué
                  hace, y ese renglón costaba ~20px de mapa en el teléfono. */}
              <form onSubmit={buscarDireccionEnMapa} className="mt-1.5">
                <div className="flex gap-1.5">
                  <div className="relative flex-1 min-w-0">
                    <MapPin
                      className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none"
                      aria-hidden="true"
                    />
                    <input
                      type="search"
                      value={buscarDireccionTexto}
                      onChange={(e) => {
                        setBuscarDireccionTexto(e.target.value)
                        setErrorBuscarDireccion('')
                      }}
                      placeholder="Buscar dirección en el mapa…"
                      className="w-full rounded-lg border-2 border-gray-200 pl-7 pr-2 py-1.5 text-sm"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={buscandoDireccion || !buscarDireccionTexto.trim()}
                    className="btn-azul px-4 text-sm disabled:opacity-60"
                  >
                    {buscandoDireccion ? (
                      '…'
                    ) : (
                      <Search className="h-4 w-4" aria-hidden="true" />
                    )}
                  </button>
                </div>
                {errorBuscarDireccion && (
                  <p className="text-xs text-bandera-rojo mt-1">
                    {errorBuscarDireccion}
                  </p>
                )}
              </form>

              {hayFiltro && (
                <button
                  onClick={() => {
                    setTipoFiltro('todos')
                    setUrgFiltro('todas')
                  }}
                  className="mt-1.5 text-xs text-bandera-rojo font-semibold"
                >
                  ✕ Quitar filtros
                </button>
              )}
            </div>
          )}

          {/* Desaparecidos tiene su PROPIA tarjeta, aparte de "Filtrar".
              Antes compartían caja y quedaban revueltos dos menús que no
              tienen nada que ver: uno decide qué se ve en el mapa y el otro
              busca personas. Separados, cada uno se abre y se cierra solo. */}
          {verDesap && (
            <div className="pointer-events-auto bg-white/95 backdrop-blur rounded-2xl shadow p-2 mt-2">
              {/* Ingresar a alguien, dentro del mismo panel: se descubre que
                  a un desaparecido lo puedes agregar tú JUSTO cuando estás
                  buscando y no lo encuentras. Lleva al formulario de siempre,
                  a elegir persona o mascota. */}
              {/* La cabecera PLIEGA el panel. Abierto ocupa media pantalla
                  —dos filtros, la paginación, país, tipo y el buscador— y
                  tapa justo el mapa donde están los marcadores que se vinieron
                  a mirar. Plegado deja solo esta barra, y la capa sigue
                  encendida: se puede buscar, plegar y mirar el resultado. */}
              <div className="flex items-center justify-between gap-2 mb-2">
                <button
                  type="button"
                  onClick={() => setPanelDesapAbierto((v) => !v)}
                  aria-expanded={panelDesapAbierto}
                  className="flex items-center gap-1 text-xs font-bold text-purple-700"
                >
                  🔍 Desaparecidos
                  <ChevronDown
                    className={`h-3.5 w-3.5 transition-transform duration-200 ${
                      panelDesapAbierto ? 'rotate-180' : ''
                    }`}
                    aria-hidden="true"
                  />
                </button>
                <button
                  type="button"
                  onClick={() => setAbrirDesapNuevo(true)}
                  className="rounded-lg border-2 border-purple-700 text-purple-700 px-2.5 py-1 text-[11px] font-bold whitespace-nowrap"
                >
                  ＋ Ingresar
                </button>
              </div>

              {panelDesapAbierto && (
                <>
              {/* Qué se está viendo, en números que SÍ cuadran con el mapa.
                  El contador del botón cuenta todo el país; el mapa solo
                  pinta los del recuadro visible y con un tope (13.000 pines
                  dejan inservible un teléfono). Sin decirlo, el número
                  parecía estar mal. */}
              {/* "Con documento": el reporte se hizo con un documento
                  oficial de por medio, no solo con un nombre. La fuente lo
                  publica enmascarado, así que NO identifica a nadie: lo que
                  dice es que ese caso está respaldado. */}
              {/* Los dos en UNA fila: apilados se comían el doble de alto sin
                  aportar nada, y son la misma clase de cosa (dos maneras de
                  acotar la misma lista). */}
              <div className="grid grid-cols-2 gap-1.5 mb-2">
                <button
                  type="button"
                  onClick={() => setSoloConDoc((v) => !v)}
                  aria-pressed={soloConDoc}
                  className={`flex items-center justify-center gap-1 rounded-lg border-2 py-1.5 px-1 text-[11px] font-bold leading-tight transition-colors ${
                    soloConDoc
                      ? 'border-bandera-azul bg-bandera-azul/10 text-bandera-azul'
                      : 'border-gray-200 text-gray-500'
                  }`}
                >
                  <BadgeCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  Con documento
                </button>

                {/* Ya localizados. No pisa la capa de desaparecidos: se suma. */}
                <button
                  type="button"
                  onClick={() => setVerEncontrados((v) => !v)}
                  aria-pressed={verEncontrados}
                  className={`flex items-center justify-center gap-1 rounded-lg border-2 py-1.5 px-1 text-[11px] font-bold leading-tight transition-colors ${
                    verEncontrados
                      ? 'border-green-600 bg-green-50 text-green-700'
                      : 'border-gray-200 text-gray-500'
                  }`}
                >
                  <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  Encontradas
                  {totalEncontrados != null ? ` (${totalEncontrados})` : ''}
                </button>
              </div>

              {verEncontrados && (
                <div className="mb-2 rounded-lg border-2 border-green-100 bg-green-50/60 p-1.5">
                  <p className="text-[11px] text-green-800 mb-1.5 px-0.5">
                    🎉 Ya aparecieron. No salen en el mapa porque, al
                    encontrarlas, la fuente deja de publicar dónde estaban.
                  </p>
                  {cargandoEncontrados && (
                    <p className="text-[11px] text-gray-500 px-0.5">Cargando…</p>
                  )}
                  {!cargandoEncontrados && encontrados.length === 0 && (
                    <p className="text-[11px] text-gray-500 px-0.5">
                      {busqDesap.trim()
                        ? 'Nadie con ese nombre entre las encontradas.'
                        : 'Todavía no hay personas localizadas aquí.'}
                    </p>
                  )}
                  <ul className="max-h-52 overflow-y-auto divide-y divide-green-100">
                    {encontrados.map((e) => (
                      <li key={e.id} className="py-1.5 px-0.5 flex items-start gap-2">
                        <span className="text-sm shrink-0" aria-hidden="true">
                          {e.tipo_ser === 'mascota' ? '🐾' : '✅'}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-gray-800 break-words">
                            {e.nombre}
                          </p>
                          {e.contacto_familiar && (
                            <a
                              href={`tel:${e.contacto_familiar}`}
                              className="text-[11px] font-semibold text-bandera-azul break-all"
                            >
                              📞 {e.contacto_familiar}
                            </a>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Flechas A LOS LADOS del texto, no debajo: antes eran dos
                  filas (el conteo y luego los controles) y ahora es una. */}
              {desapZona?.enZona != null && (
                <div className="mb-2 flex items-center justify-center gap-2">
                  {desapZona.paginas > 1 && (
                    <button
                      type="button"
                      onClick={() => setPaginaDesap((p) => Math.max(0, p - 1))}
                      disabled={paginaDesap === 0}
                      aria-label="Página anterior de desaparecidos"
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border-2 border-gray-200 text-gray-600 disabled:opacity-40"
                    >
                      <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                    </button>
                  )}
                  <p className="min-w-0 text-[11px] leading-snug text-gray-600 text-center">
                    {desapZona.paginas > 1 ? (
                      <>
                        Viendo{' '}
                        <b>
                          {desapZona.desde.toLocaleString('es')}–
                          {desapZona.hasta.toLocaleString('es')}
                        </b>{' '}
                        de <b>{desapZona.enZona.toLocaleString('es')}</b> aquí
                      </>
                    ) : (
                      <>
                        <b>{desapZona.enZona.toLocaleString('es')}</b> aquí
                        {totalDesap != null &&
                          totalDesap > desapZona.enZona && (
                            <> · {totalDesap.toLocaleString('es')} en total</>
                          )}
                      </>
                    )}
                  </p>
                  {/* El servidor corta en 1.000 por respuesta, así que para
                      llegar a los 6.379 de Caracas hay que ir de mil en mil.
                      Sin esto, el número prometía gente inalcanzable. */}
                  {desapZona.paginas > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        setPaginaDesap((p) =>
                          Math.min((desapZona.paginas ?? 1) - 1, p + 1),
                        )
                      }
                      disabled={paginaDesap >= desapZona.paginas - 1}
                      aria-label="Página siguiente de desaparecidos"
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border-2 border-gray-200 text-gray-600 disabled:opacity-40"
                    >
                      <ChevronRight className="h-4 w-4" aria-hidden="true" />
                    </button>
                  )}
                </div>
              )}
              {/* País y tipo en UNA fila de selectores.
                  Antes eran dos filas de botones (4 + 3) que se comían ~80px
                  del mapa en el teléfono. Como selectores ocupan una sola
                  fila, dicen en texto qué hay elegido sin tener que leer
                  cuál está resaltado, y aguantan más países sin desbordarse. */}
              <div className="grid grid-cols-2 gap-1.5 mb-2">
                <select
                  aria-label="País de los desaparecidos"
                  className="w-full rounded-lg border-2 border-gray-200 px-2 py-1.5 text-xs font-semibold"
                  value={paisDesap ?? ''}
                  onChange={(e) =>
                    e.target.value
                      ? elegirPaisDesap(e.target.value)
                      : setPaisDesap(null)
                  }
                >
                  <option value="">🌎 Todos los países</option>
                  {(['Venezuela', 'Chile', 'Colombia', 'Indonesia'] as const).map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Personas o mascotas"
                  className="w-full rounded-lg border-2 border-gray-200 px-2 py-1.5 text-xs font-semibold"
                  value={tipoSerDesap ?? ''}
                  onChange={(e) =>
                    setTipoSerDesap(
                      (e.target.value || null) as 'persona' | 'mascota' | null,
                    )
                  }
                >
                  <option value="">🧑🐾 Personas y mascotas</option>
                  <option value="persona">🧑 Solo personas</option>
                  <option value="mascota">🐾 Solo mascotas</option>
                </select>
              </div>
              {paisDesap === 'Venezuela' && (
                <p className="mb-2 text-[11px] font-semibold text-gray-500 text-center">
                  Terremoto Venezuela 2026
                </p>
              )}
              {/* Tebusco.app es una alianza específica de Venezuela: no aplica
                  cuando se está viendo el dataset de otro país. Chip chico
                  y directo: antes era una tarjeta grande que competía con
                  el resto del panel. */}
              {paisDesap === 'Venezuela' && (
                <a
                  href="https://tebusco.app/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mb-2 flex w-fit mx-auto items-center gap-1 rounded-full border border-bandera-azul/20 bg-white px-2 py-0.5 no-underline text-[10px] font-semibold text-bandera-azul hover:bg-bandera-azul/5"
                >
                  <Search className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
                  También en Tebusco.app
                  <span aria-hidden="true">↗</span>
                </a>
              )}
              {/* Aviso sobre la fuente del scraper: es específico de la
                  recolección de datos de Venezuela, no aplica a otros países. */}
              {paisDesap === 'Venezuela' && ultimaCargaDesap && (
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
                                  d.tipo_ser === 'mascota' ? '🐾 Mascota' : null,
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
                </>
              )}
            </div>
          )}
        </div>

        {/* Botones flotantes: SOS + Reportar */}
        <div
          className="absolute bottom-0 left-0 right-0 z-[1000] pointer-events-none"
          data-map-overlay="bottom"
        >
          <div className="px-4 pb-4 pt-2">
            <div className="mx-auto w-full max-w-md flex flex-col gap-2.5 pointer-events-auto">
              {/* Fila chica: "Crear Cuenta" a la izquierda y "Desaparecidos"
                  a la derecha. Desaparecidos bajó de botón grande a pastilla
                  porque compite con SOS y Reportar sin ser una urgencia del
                  mismo tipo: se busca a alguien con calma, no en tres
                  segundos. Y devuelve alto al mapa. */}
              <div className="flex items-center justify-between gap-2">
                {!session ? (
                  <button
                    onClick={() => navigate('/registro?rol=voluntario')}
                    className="btn-verde w-auto text-sm py-2 px-5"
                  >
                    <Heart className="h-4 w-4" aria-hidden="true" />
                    Crear Cuenta
                  </button>
                ) : (
                  <span />
                )}
                {/* Un toque abre las dos únicas cosas que se hacen aquí:
                    MIRAR quién falta o INGRESAR a alguien. Antes el botón
                    solo prendía la capa y para ingresar había que ir a
                    "Reportar", que no es donde uno lo busca. */}
                {menuDesap ? (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => {
                        // Ya no abre el filtro general: desaparecidos tiene
                        // su propio panel y mezclarlos era el problema.
                        setVerDesapManual(true)
                        // Vuelve abierto: apretaste "Ver" esperando verlo.
                        setPanelDesapAbierto(true)
                        setMenuDesap(false)
                      }}
                      className="flex items-center gap-1.5 rounded-full border-2 border-purple-700 bg-purple-700 text-white py-2 px-3.5 text-sm font-bold whitespace-nowrap"
                    >
                      <UserSearch className="h-4 w-4 shrink-0" aria-hidden="true" />
                      Ver
                    </button>
                    <button
                      onClick={() => {
                        setAbrirDesapNuevo(true)
                        setMenuDesap(false)
                      }}
                      className="flex items-center gap-1 rounded-full border-2 border-purple-700 bg-white text-purple-700 py-2 px-3.5 text-sm font-bold whitespace-nowrap"
                    >
                      ＋ Ingresar
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      // Si la capa ya está encendida, el botón la apaga: es
                      // lo que espera quien acaba de prenderla y quiere el
                      // mapa limpio otra vez.
                      if (verDesap) {
                        setVerDesapManual(false)
                        setBusqDesap('')
                      } else {
                        setMenuDesap(true)
                      }
                    }}
                    aria-pressed={verDesap}
                    className={`flex items-center gap-1.5 rounded-full border-2 py-2 px-4 text-sm font-bold whitespace-nowrap ${
                      verDesap
                        ? 'bg-purple-700 border-purple-700 text-white'
                        : 'bg-white border-purple-700 text-purple-700'
                    }`}
                  >
                    <UserSearch className="h-4 w-4 shrink-0" aria-hidden="true" />
                    Desaparecidos
                  </button>
                )}
              </div>
              {/* SOS + Reportar lado a lado: más compacto y deja más mapa
                  visible. Misma altura mínima para que el SOS, que lleva dos
                  líneas, no deje al otro botón descuadrado. */}
              <div className="flex gap-2.5 items-stretch">
                <button
                  onClick={() => setAbrirSos(true)}
                  className={`btn-rojo flex-1 min-h-[3.5rem] px-3 text-sm sm:text-base leading-tight ${
                    pulsoSos ? 'animate-pulse' : ''
                  }`}
                >
                  <Siren className="h-5 w-5 shrink-0" aria-hidden="true" />
                  SOS / Necesito rescate
                </button>
                <button
                  onClick={() => setAbrirReporte(true)}
                  className="btn-azul flex-1 min-h-[3.5rem] px-3 text-sm sm:text-base leading-tight"
                >
                  <MessageSquarePlus className="h-5 w-5 shrink-0" aria-hidden="true" />
                  Reportar
                </button>
              </div>
            </div>
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

      {(abrirReporte || abrirDesapNuevo) && (
        <ReportarModal
          // "Ingresar" desde el botón de Desaparecidos entra directo a elegir
          // persona o mascota: ya sabe a qué viene, no hay que pasearlo por
          // una lista donde esa opción ya no está.
          abrirEnDesaparecido={abrirDesapNuevo}
          coordInicial={coordAuto}
          fuenteInicial={fuenteAuto}
          puedeReportarHospital={puedeReportarHospital}
          onYoTengo={() => {
            setAbrirReporte(false)
            setAbrirDesapNuevo(false)
            setOfertaAbierta(true)
            // Enciende la capa, o publicaría algo que después no ve en el mapa.
            setCapas((c) => ({ ...c, tengo: true }))
          }}
          onCerrar={() => {
            setAbrirReporte(false)
            setAbrirDesapNuevo(false)
            setAbrirDesapNuevo(false)
          }}
          onCreado={(tipo, extra) => {
            setAbrirReporte(false)
            setAbrirDesapNuevo(false)
            notificar(
              tipo === 'hospital'
                ? 'Hospital registrado correctamente. Gracias por ayudar a mantener la información actualizada.'
                : tipo === 'atencion_psicologica'
                  ? 'Solicitud creada. Gracias por confiar en la red: el equipo psicológico revisará tu caso y te contactará lo antes posible.'
                  : tipo === 'desaparecido'
                    ? 'Reporte creado. Gracias por avisar: ya aparece en el mapa, en la capa de Desaparecidos.'
                    : 'Reporte creado correctamente. Gracias por avisar: el equipo revisará la solicitud y te contactará lo antes posible.',
              'exito',
            )
            if (tipo === 'hospital') {
              setTipoFiltro('hospital')
              void recargarAcopios()
            }
            if (tipo === 'desaparecido') {
              // Enciende la capa, cambia al país del registro recién creado
              // (si se detectó) y lo resalta: antes el mensaje decía "ya
              // aparece en el mapa" pero nada de esto pasaba de verdad.
              // También vuela el mapa a ese país: sin esto, el filtro queda
              // bien puesto pero el mapa se queda donde estaba y el punto
              // nuevo no entra en la vista (bounding box) que se consulta.
              setVerDesapManual(true)
              if (extra?.pais) {
                setPaisDesap(extra.pais)
                const vista = VISTA_PAIS_DESAP[extra.pais]
                if (vista) setVistaPaisDesap(vista)
              }
              if (extra?.id) setDesaparecidoSeleccionadoId(extra.id)
            }
          }}
        />
      )}
      {abrirSos && (
        <SosModal onCerrar={() => setAbrirSos(false)} coordInicial={coordAuto} />
      )}
      {ofertaAbierta && (
        <OfertaModal
          onCerrar={() => setOfertaAbierta(false)}
          // Volver a Reportar, que es de donde se entra a "Yo tengo".
          onVolver={() => {
            setOfertaAbierta(false)
            setAbrirReporte(true)
          }}
        />
      )}
      {/* No pinta nada: avisa cuando entra un reporte o una oferta. Va aquí,
          con los demás componentes sin interfaz, porque ya no ocupa un lugar
          en la pantalla. */}
      <AvisosEnVivo />
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
