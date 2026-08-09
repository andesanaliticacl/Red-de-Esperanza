import { useEffect, useState } from 'react'
import {
  TIPO_META,
  type NecesidadTipo,
  type NecesidadUrgencia,
} from '../lib/types'
import { crearNecesidad } from '../lib/reportes'
import { useNotificaciones } from '../context/NotificacionesContext'
import {
  listarCatastrofes,
  type Catastrofe,
} from '../lib/catastrofes'
import { supabase } from '../lib/supabase'
import {
  buscarHospitalesGoogle,
  detalleLugarGoogle,
  GoogleMapsConfigError,
  type HospitalGoogle,
} from '../lib/googleGeocode'
import {
  obtenerUbicacion,
  geocodificarDireccion,
  parsearCoordenadas,
  paisPorCoordenadas,
  type FuenteUbicacion,
} from '../lib/geo'
import SelectorPunto from './SelectorPunto'
import EntradaTelefono, {
  esTelefonoValido,
  mensajeTelefono,
} from './EntradaTelefono'
import { paisPorIP } from '../lib/visitas'
import { esCedulaVenezolanaValida, esRutChilenoValido } from '../lib/documentos'
import {
  ShoppingBasket,
  TriangleAlert,
  Ambulance,
  Globe,
  HeartHandshake,
  UserSearch,
  PawPrint,
  User,
  Heart,
  type LucideIcon,
} from 'lucide-react'
import { ICONO_TIPO, ICONO_HOSPITAL } from '../lib/iconosTipo'
import { subirFotoMascota } from '../lib/fotoMascota'
import { subirFotoDesaparecido } from '../lib/fotoDesaparecido'

// Menú de "Reportar necesidad". El rescate NO va aquí: tiene su propio botón
// rojo "🆘 SOS" (SosModal).
//
// OJO: al agregar un NecesidadTipo nuevo hay que meterlo en GRUPOS o en
// DIRECTOS; si no, no aparecerá en ninguna pantalla. Antes había una sola
// lista plana (TIPOS) que se pintaba entera, así que bastaba con añadirlo ahí.
//
// Las 11 opciones de golpe abrumaban a quien reporta bajo estrés (y los
// nombres eran de categoría, no de intención). Ahora la primera pantalla
// muestra pocos bloques grandes en lenguaje de persona ("necesito algo"),
// y solo los dos primeros abren un segundo paso con sus opciones. El resto
// entra directo a su formulario, sin pasos de más.
type GrupoReporte = 'necesito' | 'peligro'

const GRUPOS: {
  v: GrupoReporte
  icono: LucideIcon
  titulo: string
  ejemplos: string
  tipos: NecesidadTipo[]
}[] = [
  {
    v: 'necesito',
    icono: ShoppingBasket,
    titulo: 'Necesito algo',
    ejemplos: 'Agua, comida, medicinas, refugio…',
    tipos: ['agua_comida', 'medicinas', 'refugio', 'sacos_arena'],
  },
  {
    v: 'peligro',
    icono: TriangleAlert,
    titulo: 'Aviso de un peligro',
    ejemplos: 'Inundación, incendio, derrumbe, zona sin ayuda…',
    tipos: ['inundacion', 'incendio', 'derrumbe', 'zona_sin_atender'],
  },
]

// Antes había un tercer grupo de "directos" (atención psicológica y
// mascota) que iban a su propio formulario sin pasar por una lista. Ahora
// "Me siento mal" es un botón chico aparte (no compite por espacio con las
// opciones grandes) y "mascota" se fusionó con "desaparecido" en un solo
// bloque persona/mascota — ver más abajo.

// Tipos de animal para el reporte de mascota.
const ANIMALES: { v: string; etiqueta: string; emoji: string }[] = [
  { v: 'perro', etiqueta: 'Perro', emoji: '🐕' },
  { v: 'gato', etiqueta: 'Gato', emoji: '🐈' },
  { v: 'otro', etiqueta: 'Otro', emoji: '🐾' },
]
// 'desaparecido' NO es un NecesidadTipo: no va a `necesidades`, sino a la
// tabla `desaparecidos` (la misma que alimenta la capa del mapa), para que
// el reporte aparezca junto con los que ya trae el scraper.
type TipoReporte = NecesidadTipo | 'hospital' | 'desaparecido'
const HOSPITAL_META = {
  etiqueta: 'Hospital',
  emoji: '🏥',
  color: '#CC0001',
}
const DESAPARECIDO_META = {
  etiqueta: 'Desaparecido',
  emoji: '🔎',
  color: '#7C3AED',
}
// Tamaños (DIÁMETRO aprox.) de una "zona sin atender", en km. Por defecto 3.
// Guardamos el radio = diámetro / 2 para que el círculo sea fino y proporcional.
const TAMANOS_ZONA = [1, 3, 5]

// ===== Ayuda emocional =====
// Contacto directo del equipo aliado, para quien no quiera esperar.
const PRAXIS_TELEFONO = '+52 1 55 3320 0457'

// Perfil del caso: con quién estamos hablando. Le da contexto al equipo
// psicológico ANTES del primer contacto.
type PerfilPsicologico = 'rescatista' | 'a_distancia' | 'en_zona' | ''
const PERFIL_PSICO_META: Record<
  Exclude<PerfilPsicologico, ''>,
  { etiqueta: string }
> = {
  rescatista: { etiqueta: 'Rescatista / voluntario con desgaste emocional' },
  a_distancia: { etiqueta: 'Afectado/a fuera de la zona del desastre' },
  en_zona: { etiqueta: 'Afectado/a en la zona del desastre' },
}
const URGENCIAS: { v: NecesidadUrgencia; etiqueta: string; clase: string }[] = [
  { v: 'alta', etiqueta: 'Alta', clase: 'btn-rojo' },
  { v: 'media', etiqueta: 'Media', clase: 'btn-amber' },
  { v: 'baja', etiqueta: 'Baja', clase: 'btn-verde' },
]

/**
 * Reportar necesidad. Todos los tipos (menos el rescate, que va en SosModal) se
 * reportan en UNA sola pantalla con mini-mapa para fijar el punto EXACTO: buscar
 * la dirección (Google Maps si hay clave; si no, OpenStreetMap), arrastrar el
 * pin, usar el GPS o pegar coordenadas. La "zona sin atender" añade un radio.
 */
export default function ReportarModal({
  onCerrar,
  onCreado,
  coordInicial,
  fuenteInicial,
  puedeReportarHospital = false,
  puedeReportarZonaAislada = false,
}: {
  onCerrar: () => void
  onCreado: (tipo?: TipoReporte) => void
  coordInicial?: { lat: number; lng: number } | null
  fuenteInicial?: FuenteUbicacion | null
  puedeReportarHospital?: boolean
  // Solo el admin puede marcar "zona aislada" (para verlas de un vistazo).
  puedeReportarZonaAislada?: boolean
}) {
  const { notificar } = useNotificaciones()
  const [paso, setPaso] = useState(1)
  // Grupo elegido en la primera pantalla (null = aún viendo los bloques
  // grandes). Se conserva al volver del formulario, para caer en la misma
  // lista de la que se salió y no obligar a empezar de cero.
  const [grupo, setGrupo] = useState<GrupoReporte | null>(null)
  // Mini-recorrido del bloque combinado "Persona o mascota": primero elige
  // a quién busca, y si es mascota, si está perdida (va a `desaparecidos`)
  // o necesita ayuda estando presente (va al reporte de mascota de siempre).
  // null = no está en este recorrido (se ve la lista de bloques grandes).
  const [pasoPersonaAnimal, setPasoPersonaAnimal] = useState<
    'elegir' | 'mascota' | null
  >(null)
  // Tramo del formulario en los reportes comunes: 1 ¿dónde? · 2 ¿qué pasa? ·
  // 3 ¿tu teléfono? Una sola pregunta por pantalla se sigue mucho mejor bajo
  // estrés que un formulario largo. Apoyo emocional, mascota y hospital NO lo
  // usan: sus campos propios no encajan en este recorrido.
  const [subPaso, setSubPaso] = useState(1)
  const [tipo, setTipo] = useState<TipoReporte>('otro')
  const [descripcion, setDescripcion] = useState('')
  const [nombrePaciente, setNombrePaciente] = useState('')
  const [edadPaciente, setEdadPaciente] = useState('')
  const [cedulaPaciente, setCedulaPaciente] = useState('')
  // Perfil del caso psicológico (elegido en las tarjetas de ayuda emocional).
  const [perfilPsico, setPerfilPsico] = useState<PerfilPsicologico>('')
  // Mascota: tipo de animal, nombre y foto (comprimida al subir).
  const [animalTipo, setAnimalTipo] = useState('perro')
  const [nombreMascota, setNombreMascota] = useState('')
  const [mascotaFile, setMascotaFile] = useState<File | null>(null)
  const [mascotaPreview, setMascotaPreview] = useState<string>('')
  // Desaparecido: persona o mascota, nombre + foto (obligatorios), y
  // documento (obligatorio SOLO si es persona).
  const [tipoSerDesap, setTipoSerDesap] = useState<'persona' | 'mascota' | ''>('')
  const [nombreDesap, setNombreDesap] = useState('')
  const [edadDesap, setEdadDesap] = useState('')
  const [documentoDesap, setDocumentoDesap] = useState('')
  const [fotoDesapFile, setFotoDesapFile] = useState<File | null>(null)
  const [fotoDesapPreview, setFotoDesapPreview] = useState<string>('')
  const [nombreHospital, setNombreHospital] = useState('')
  const [hospitalConfirmado, setHospitalConfirmado] =
    useState<HospitalGoogle | null>(null)
  const [sugerenciasHospital, setSugerenciasHospital] = useState<HospitalGoogle[]>([])
  const [buscandoHospital, setBuscandoHospital] = useState(false)
  const [seleccionandoHospital, setSeleccionandoHospital] = useState(false)
  const [urgencia, setUrgencia] = useState<NecesidadUrgencia>('media')
  const [zona, setZona] = useState('') // dirección / referencia del lugar
  const [tamZonaKm, setTamZonaKm] = useState(3) // diámetro aprox. de la zona
  // Teléfono OBLIGATORIO con código de país (para que el botón de WhatsApp
  // abra el chat). Se guarda completo, p. ej. "+58 4121234567".
  const [contacto, setContacto] = useState('')
  // Punto fijado (el pin). coordAuto = ubicación detectada del usuario, que se
  // usa como punto por defecto en las necesidades comunes (no en derrumbe/zona,
  // que están donde está el edificio/zona, no donde está quien reporta).
  const [coordAuto, setCoordAuto] = useState<{ lat: number; lng: number } | null>(
    coordInicial ?? null,
  )
  const [coord, setCoord] = useState<{ lat: number; lng: number } | null>(
    coordInicial ?? null,
  )
  const [fuente, setFuente] = useState<FuenteUbicacion | null>(
    fuenteInicial ?? null,
  )
  const [gpsEstado, setGpsEstado] = useState<'idle' | 'buscando' | 'error'>(
    coordInicial ? 'idle' : 'buscando',
  )
  const [geoEstado, setGeoEstado] = useState<'idle' | 'buscando'>('idle')
  const [coordsTexto, setCoordsTexto] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  // Catástrofe (evento) opcional a la que pertenece el reporte.
  const [catastrofes, setCatastrofes] = useState<Catastrofe[]>([])
  const [catastrofeId, setCatastrofeId] = useState('')
  // Ciudad aproximada de quien reporta (por IP). Solo se usa para afinar a
  // qué catástrofe pertenece el reporte cuando hay varias en el mismo país.
  const [ciudadIP, setCiudadIP] = useState<string | null>(null)

  const esDerrumbe = tipo === 'derrumbe'
  const esMascota = tipo === 'mascota'
  const esZonaAislada = tipo === 'zona_aislada'
  // Ambas zonas (sin atender y aislada) comparten el flujo: radio + pin del área.
  const esZona = tipo === 'zona_sin_atender' || esZonaAislada
  const esAtencionPsicologica = tipo === 'atencion_psicologica'
  const esHospital = tipo === 'hospital'
  const esDesaparecido = tipo === 'desaparecido'
  const requiereUbicacion = !esAtencionPsicologica
  // Reportes comunes: recorrido de 3 tramos. Los tres tipos con campos muy
  // propios (perfil psicológico, foto del animal, buscador de Google Maps)
  // conservan su pantalla única, que ya está afinada.
  // Todos los reportes van por tramos menos "hospital", que es un registro
  // interno del equipo (buscador de Google Maps) y no una petición de ayuda.
  const usaPasos = !esHospital
  /** ¿Toca pintar lo del tramo n? Sin tramos (pantalla única), siempre. */
  const enTramo = (n: number) => !usaPasos || subPaso === n

  // Lo IMPRESCINDIBLE de cada tramo, para no dejar avanzar con lo vacío y que
  // el error salte al final (cuando ya se olvidó qué faltaba).
  const tramoCompleto = (() => {
    if (subPaso === 1) {
      if (esAtencionPsicologica) {
        return Boolean(nombrePaciente.trim() && cedulaPaciente.trim())
      }
      if (esDesaparecido) {
        return Boolean(
          nombreDesap.trim() &&
            fotoDesapFile &&
            (tipoSerDesap === 'mascota' || documentoDesap.trim()),
        )
      }
      // El resto necesita un punto: pin en el mapa o una dirección escrita.
      return Boolean(coord || zona.trim())
    }
    if (subPaso === 2 && esAtencionPsicologica) {
      return Boolean(descripcion.trim())
    }
    if (subPaso === 2 && esDesaparecido) {
      return Boolean(coord || zona.trim())
    }
    return true
  })()
  const metaTipo =
    tipo === 'hospital'
      ? HOSPITAL_META
      : tipo === 'desaparecido'
        ? DESAPARECIDO_META
        : TIPO_META[tipo]
  // Opciones del grupo abierto. "Zona aislada" solo la ven quienes pueden
  // crearla (admin / líder de voluntarios), dentro del grupo de peligros.
  const grupoAbierto = GRUPOS.find((g) => g.v === grupo) ?? null
  const tiposDelGrupo: NecesidadTipo[] = grupoAbierto
    ? [
        ...grupoAbierto.tipos,
        ...(grupoAbierto.v === 'peligro' && puedeReportarZonaAislada
          ? (['zona_aislada'] as NecesidadTipo[])
          : []),
      ]
    : []

  async function actualizarUbicacion() {
    setGpsEstado('buscando')
    try {
      const u = await obtenerUbicacion()
      setCoord({ lat: u.lat, lng: u.lng })
      setCoordAuto({ lat: u.lat, lng: u.lng })
      setFuente(u.fuente)
      setGpsEstado('idle')
    } catch {
      setGpsEstado('error')
    }
  }

  // Si no llegó una ubicación inicial, la buscamos automáticamente al abrir.
  useEffect(() => {
    if (!coordInicial) actualizarUbicacion()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Catástrofes disponibles (para etiquetar el reporte). Si falla, se sigue
  // sin la lista: el campo es opcional y no debe frenar un reporte.
  useEffect(() => {
    listarCatastrofes()
      .then(setCatastrofes)
      .catch(() => setCatastrofes([]))
  }, [])

  // Ciudad aproximada por IP, solo para afinar la catástrofe. Es best-effort:
  // si falla, la asignación se queda con el país (o con la más reciente).
  useEffect(() => {
    let vivo = true
    paisPorIP()
      .then(({ ciudad }) => {
        if (vivo) setCiudadIP(ciudad)
      })
      .catch(() => {})
    return () => {
      vivo = false
    }
  }, [])

  // La catástrofe se asigna SOLA. Quien pide ayuda no tiene que elegir un
  // evento de una lista (y desde la migración 57 tampoco puede crearlos:
  // los define la coordinación desde el panel, con país y ciudad).
  // Prioridad: misma ciudad y país › mismo país › la más reciente.
  useEffect(() => {
    if (catastrofeId || catastrofes.length === 0) return
    const igual = (a: string | null, b: string | null | undefined) =>
      !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase()

    const pais = coord ? paisPorCoordenadas(coord.lat, coord.lng) : null
    const porCiudad = catastrofes.find(
      (c) => igual(pais, c.pais) && igual(ciudadIP, c.ciudad),
    )
    const porPais = catastrofes.find((c) => igual(pais, c.pais))
    // listarCatastrofes() las trae de la más reciente a la más antigua.
    const elegida = porCiudad ?? porPais ?? catastrofes[0]
    if (elegida) setCatastrofeId(elegida.id)
  }, [catastrofes, coord, ciudadIP, catastrofeId])

  useEffect(() => {
    if (!esHospital) return
    const q = nombreHospital.trim()
    if (hospitalConfirmado?.nombre === q) return
    setHospitalConfirmado(null)
    if (q.length < 3) {
      setSugerenciasHospital([])
      setBuscandoHospital(false)
      return
    }
    let cancelado = false
    setBuscandoHospital(true)
    const t = window.setTimeout(async () => {
      try {
        const resultados = await buscarHospitalesGoogle(q)
        if (!cancelado) {
          setSugerenciasHospital(resultados)
          setErrorMsg('')
        }
      } catch (e) {
        if (!cancelado) {
          setSugerenciasHospital([])
          setErrorMsg(
            e instanceof GoogleMapsConfigError
              ? e.message
              : 'No pudimos consultar Google Maps. Intenta de nuevo.',
          )
        }
      } finally {
        if (!cancelado) {
          setBuscandoHospital(false)
        }
      }
    }, 450)
    return () => {
      cancelado = true
      window.clearTimeout(t)
    }
  }, [esHospital, nombreHospital, hospitalConfirmado?.nombre])

  function elegirTipo(t: TipoReporte) {
    setTipo(t)
    if (
      t === 'derrumbe' ||
      t === 'rescate' ||
      t === 'zona_sin_atender' ||
      t === 'zona_aislada' ||
      t === 'incendio' ||
      t === 'inundacion'
    )
      setUrgencia('alta')
    if (t === 'atencion_psicologica') {
      setUrgencia('media')
      setPerfilPsico('') // vuelve a mostrar las tarjetas de ayuda emocional
    }
    // 'desaparecido' NO resetea tipoSerDesap: el bloque combinado "Persona o
    // mascota" ya lo eligió antes de llamar aquí (ver pasoPersonaAnimal).
    // Derrumbe / zona / desaparecido: el pin NO empieza en la ubicación de
    // quien reporta, sino donde se vio a la persona/mascota por última vez.
    setCoord(
      t === 'derrumbe' ||
        t === 'zona_sin_atender' ||
        t === 'zona_aislada' ||
        t === 'hospital' ||
        t === 'atencion_psicologica' ||
        t === 'desaparecido'
        ? null
        : coordAuto,
    )
    setErrorMsg('')
    setSubPaso(1)
    setPaso(2)
  }

  // Geocodifica la dirección escrita (Google → OSM) y centra el pin ahí; luego
  // se puede arrastrar al punto exacto. Si no la encuentra, avisa sin bloquear.
  async function buscarDireccion() {
    const dir = zona.trim()
    if (!dir) {
      setErrorMsg('Escribe primero la dirección para buscarla en el mapa.')
      return
    }
    setErrorMsg('')
    setGeoEstado('buscando')
    // Sin restricción de país: la red ya es global y este formulario no
    // tiene un selector de país propio para saber a cuál restringir.
    const g = await geocodificarDireccion(dir, { pais: '', cc: '' })
    setGeoEstado('idle')
    if (g) {
      setCoord(g)
      setFuente(null)
    } else {
      setErrorMsg(
        'No encontramos esa dirección. Arrastra el pin al lugar exacto, usa tu ubicación o pega las coordenadas.',
      )
    }
  }

  function aplicarCoordsTexto() {
    const c = parsearCoordenadas(coordsTexto)
    if (c) {
      setCoord(c)
      setFuente(null)
      setErrorMsg('')
    } else {
      setErrorMsg('Coordenadas no válidas. Ejemplo: 10.5061, -66.9146')
    }
  }

  async function enviar() {
    setGuardando(true)
    setErrorMsg('')
    try {
      // El teléfono es OBLIGATORIO: sin él, nadie puede contactar a la persona.
      if (!esHospital && !esTelefonoValido(contacto)) {
        throw new Error(mensajeTelefono())
      }
      if (esHospital && !nombreHospital.trim()) {
        throw new Error('Escribe el nombre del hospital.')
      }
      if (esHospital && !hospitalConfirmado) {
        throw new Error('Selecciona un hospital confirmado por Google Maps.')
      }
      if (esHospital && !zona.trim()) {
        throw new Error('Escribe la direccion o referencia del hospital.')
      }

      if (esAtencionPsicologica && !nombrePaciente.trim()) {
        throw new Error(
          'Escribe tu nombre o el nombre de la persona que necesita apoyo.',
        )
      }
      // La cédula/RUT es OBLIGATORIA: acepta cédula venezolana o RUT chileno.
      if (esAtencionPsicologica) {
        const doc = cedulaPaciente.trim()
        if (!doc) {
          throw new Error(
            'Escribe tu cédula (Venezuela) o RUT (Chile) para poder identificar tu caso.',
          )
        }
        if (!esCedulaVenezolanaValida(doc) && !esRutChilenoValido(doc)) {
          throw new Error(
            'Ese documento no parece válido. Escribe una cédula venezolana (ej. V-12345678) o un RUT chileno (ej. 12.345.678-5).',
          )
        }
      }
      if (esAtencionPsicologica && edadPaciente.trim()) {
        const edad = Number(edadPaciente)
        if (!Number.isFinite(edad) || edad < 1 || edad > 120) {
          throw new Error('La edad no parece valida. Escribe solo el numero.')
        }
      }
      if (esAtencionPsicologica && !descripcion.trim()) {
        throw new Error(
          'Cuentanos brevemente que apoyo necesitas. Puedes escribirlo con tus palabras.',
        )
      }

      if (esDesaparecido) {
        if (!nombreDesap.trim()) {
          throw new Error('Escribe el nombre de la persona o mascota.')
        }
        if (!fotoDesapFile) {
          throw new Error('Una foto es obligatoria para poder reconocerlo/a.')
        }
        if (tipoSerDesap === 'persona') {
          const doc = documentoDesap.trim()
          if (!doc) {
            throw new Error('Escribe su cédula (Venezuela) o RUT (Chile).')
          }
          if (!esCedulaVenezolanaValida(doc) && !esRutChilenoValido(doc)) {
            throw new Error(
              'Ese documento no parece válido. Escribe una cédula venezolana (ej. V-12345678) o un RUT chileno (ej. 12.345.678-5).',
            )
          }
        }
        if (edadDesap.trim()) {
          const edad = Number(edadDesap)
          if (!Number.isFinite(edad) || edad < 0 || edad > 120) {
            throw new Error('La edad no parece válida. Escribe solo el número.')
          }
        }
      }

      let lat = esAtencionPsicologica ? null : coord?.lat ?? null
      let lng = esAtencionPsicologica ? null : coord?.lng ?? null

      // Si aún no hay punto pero sí dirección, intentamos geocodificar.
      // Sin restricción de país (red global, sin selector de país propio).
      if (!esAtencionPsicologica && (lat === null || lng === null) && zona.trim()) {
        const g = await geocodificarDireccion(zona.trim(), { pais: '', cc: '' })
        if (g) {
          lat = g.lat
          lng = g.lng
        }
      }
      if (!esAtencionPsicologica && (lat === null || lng === null)) {
        throw new Error(
          'Falta la ubicación. Busca la dirección, arrastra el pin, usa tu ubicación o pega coordenadas.',
        )
      }

      // La red es global: ya no se restringe el país del reporte (antes solo
      // se aceptaban puntos dentro de Venezuela).

      if (esHospital) {
        const hospital = hospitalConfirmado
        if (!hospital?.lat || !hospital?.lng) {
          throw new Error('Selecciona un hospital confirmado por Google Maps.')
        }
        const { data: auth } = await supabase.auth.getUser()
        const detalle = descripcion.trim()
        const { error } = await supabase.from('centros_acopio').insert({
          nombre: hospital.nombre,
          descripcion: detalle ? `Hospital. ${detalle}` : 'Hospital',
          pais: 'Venezuela',
          direccion: hospital.direccion,
          contacto: null,
          red_social: null,
          lat: hospital.lat,
          lng: hospital.lng,
          creado_por: auth?.user?.id ?? null,
        })
        if (error) throw error
        onCreado('hospital')
        return
      }

      // Desaparecido: va a la tabla `desaparecidos` (no a `necesidades`), la
      // misma que alimenta la capa del mapa, para que aparezca junto con los
      // que ya trae el scraper. El documento (si es persona) es privado y va
      // a una tabla aparte.
      if (esDesaparecido) {
        let fotoUrlDesap: string
        try {
          fotoUrlDesap = await subirFotoDesaparecido(fotoDesapFile!)
        } catch (e) {
          throw new Error(
            'No se pudo subir la foto. Revisa tu conexión e inténtalo de nuevo. ' +
              ((e as Error).message ?? ''),
          )
        }
        const { data: auth } = await supabase.auth.getUser()
        const pais = lat !== null && lng !== null ? paisPorCoordenadas(lat, lng) : null
        const { data: fila, error } = await supabase
          .from('desaparecidos')
          .insert({
            nombre: nombreDesap.trim(),
            edad: edadDesap.trim() ? Number(edadDesap) : null,
            genero: null,
            fecha_desaparicion: new Date().toISOString().slice(0, 10),
            ultima_ubicacion: zona.trim() || null,
            lat,
            lng,
            foto_url: fotoUrlDesap,
            contacto_familiar: contacto,
            estado: 'no_encontrado',
            fuente: 'reporte_ciudadano',
            pais,
            tipo_ser: tipoSerDesap,
            reportado_por: auth?.user?.id ?? null,
          })
          .select('id')
          .single()
        if (error) throw error
        if (tipoSerDesap === 'persona' && documentoDesap.trim()) {
          const { error: errDoc } = await supabase
            .from('desaparecidos_documento')
            .insert({
              desaparecido_id: fila.id,
              documento: documentoDesap.trim(),
            })
          if (errDoc) throw errDoc
        }
        onCreado('desaparecido')
        return
      }

      // Mascota: si adjuntó foto, la comprimimos y subimos ahora para tener
      // la URL. La descripción resume el animal y su nombre.
      let fotoUrlMascota: string | null = null
      if (esMascota && mascotaFile) {
        try {
          fotoUrlMascota = await subirFotoMascota(mascotaFile)
        } catch (e) {
          throw new Error(
            'No se pudo subir la foto de la mascota. Revisa tu conexión e inténtalo de nuevo. ' +
              ((e as Error).message ?? ''),
          )
        }
      }

      const descripcionMascota = [
        `${ANIMALES.find((a) => a.v === animalTipo)?.emoji ?? '🐾'} ${
          ANIMALES.find((a) => a.v === animalTipo)?.etiqueta ?? 'Animal'
        }`,
        nombreMascota.trim() ? `Nombre: ${nombreMascota.trim()}` : '',
        descripcion.trim() ? `Detalle: ${descripcion.trim()}` : '',
      ]
        .filter(Boolean)
        .join('\n')

      const res = await crearNecesidad({
        tipo: tipo as NecesidadTipo,
        urgencia,
        descripcion: esAtencionPsicologica
          ? [
              `Nombre: ${nombrePaciente.trim()}`,
              edadPaciente.trim() ? `Edad: ${edadPaciente.trim()}` : '',
              `Documento: ${cedulaPaciente.trim()}`,
              perfilPsico
                ? `Perfil: ${PERFIL_PSICO_META[perfilPsico].etiqueta}`
                : '',
              `Solicitud: ${descripcion.trim()}`,
            ]
              .filter(Boolean)
              .join('\n')
          : esMascota
            ? descripcionMascota
            : descripcion.trim() || metaTipo.etiqueta,
        zona: esAtencionPsicologica ? null : zona.trim() || null,
        lat,
        lng,
        radio_km: esZona ? tamZonaKm / 2 : null,
        foto_url: fotoUrlMascota,
        catastrofe_id: catastrofeId || null,
        contacto,
        contactoObligatorio: true,
        origen: 'web',
      })
      if (res.offline) {
        notificar(
          '📴 Guardado sin Internet. Tu reporte se enviará automáticamente al reconectar.',
          'alerta',
        )
      }
      onCreado(tipo)
    } catch (e) {
      setErrorMsg((e as Error).message)
      setGuardando(false)
    }
  }

  // Bloque de ubicación con mini-mapa (común a todos los tipos).
  const bloqueUbicacionMapa = (
    <div>
      <p className="font-bold mb-1">
        Ubicación{' '}
        {esZona
          ? 'de la zona'
          : esDerrumbe
            ? 'del edificio'
            : esHospital
              ? 'del hospital'
              : 'del reporte'}{' '}
        <span className="text-bandera-rojo">*</span>
      </p>
      <p className="text-xs text-gray-500 mb-2">
        Búscala y luego <strong>arrastra el pin</strong> al punto exacto (también
        puedes tocar el mapa).
      </p>
      <div className="flex gap-2 mb-2">
        <button
          type="button"
          onClick={buscarDireccion}
          disabled={geoEstado === 'buscando'}
          className="btn-azul flex-1 py-2.5 text-sm disabled:opacity-60"
        >
          {geoEstado === 'buscando' ? 'Buscando…' : '🔎 Buscar dirección'}
        </button>
        <button
          type="button"
          onClick={actualizarUbicacion}
          disabled={gpsEstado === 'buscando'}
          className="btn-amber flex-1 py-2.5 text-sm disabled:opacity-60"
        >
          {gpsEstado === 'buscando' ? 'Buscando…' : '📍 Mi ubicación'}
        </button>
      </div>

      <SelectorPunto
        coord={coord}
        onCambio={(la, ln) => setCoord({ lat: la, lng: ln })}
      />

      {coord ? (
        <p className="text-xs text-green-700 mt-1.5">
          ✅ Punto fijado: {coord.lat.toFixed(5)}, {coord.lng.toFixed(5)}
          {fuente === 'ip' && ' (aproximado por red)'}
        </p>
      ) : (
        <p className="text-xs text-amber-700 mt-1.5">
          Aún sin punto. Busca la dirección o toca el mapa.
        </p>
      )}

      <details className="mt-2">
        <summary className="text-xs text-bandera-azul font-semibold cursor-pointer">
          📌 Pegar coordenadas de Google Maps (opcional)
        </summary>
        <div className="flex gap-2 mt-2">
          <input
            className="input text-sm"
            placeholder="Ej: 10.5061, -66.9146"
            value={coordsTexto}
            onChange={(e) => setCoordsTexto(e.target.value)}
          />
          <button
            type="button"
            onClick={aplicarCoordsTexto}
            className="btn-gris py-2 px-3 text-sm"
          >
            Usar
          </button>
        </div>
        <p className="text-[11px] text-gray-400 mt-1">
          En Google Maps: mantén pulsado el lugar → copia los números que salen.
        </p>
      </details>
    </div>
  )

  const bloqueDatosMascota = (
    <div className="space-y-3 rounded-2xl border border-amber-100 bg-amber-50/60 p-3">
      <p className="text-sm text-amber-950">
        Una foto ayuda muchísimo a reconocerlo.
      </p>
      <div>
        <p className="font-bold mb-1">¿Qué animal es?</p>
        <div className="grid grid-cols-3 gap-2">
          {ANIMALES.map((a) => (
            <button
              key={a.v}
              type="button"
              onClick={() => setAnimalTipo(a.v)}
              className={`rounded-xl border-2 py-2 text-sm font-semibold ${
                animalTipo === a.v
                  ? 'border-bandera-azul bg-blue-50'
                  : 'border-gray-200 bg-white'
              }`}
            >
              {a.emoji} {a.etiqueta}
            </button>
          ))}
        </div>
      </div>
      <label className="block">
        <span className="font-bold">Nombre (si lo tiene)</span>
        <input
          className="input mt-1"
          placeholder="Ej: Firulais"
          maxLength={40}
          value={nombreMascota}
          onChange={(e) => setNombreMascota(e.target.value)}
        />
      </label>
      <div>
        <p className="font-bold mb-1">Foto (opcional)</p>
        {mascotaPreview ? (
          <div className="flex items-center gap-3">
            <img
              src={mascotaPreview}
              alt="Mascota"
              className="h-20 w-20 rounded-xl object-cover border"
            />
            <button
              type="button"
              onClick={() => {
                setMascotaFile(null)
                setMascotaPreview('')
              }}
              className="text-sm font-semibold text-bandera-rojo"
            >
              Quitar foto
            </button>
          </div>
        ) : (
          <label className="btn-gris inline-flex py-2 px-4 cursor-pointer">
            📷 Elegir foto
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (!f) return
                setMascotaFile(f)
                setMascotaPreview(URL.createObjectURL(f))
              }}
            />
          </label>
        )}
        <p className="text-[11px] text-gray-500 mt-1">
          La foto se comprime automáticamente para que pese poco.
        </p>
      </div>
    </div>
  )

  const bloqueDatosDesaparecido = (
    <div className="space-y-3 rounded-2xl border border-purple-100 bg-purple-50/60 p-3">
      <p className="text-sm text-purple-950">
        Una foto reciente ayuda muchísimo a reconocerlo/a.
      </p>
      <label className="block">
        <span className="font-bold">
          Nombre <span className="text-bandera-rojo">*</span>
        </span>
        <input
          className="input mt-1"
          placeholder={tipoSerDesap === 'mascota' ? 'Ej: Firulais' : 'Nombre y apellido'}
          maxLength={60}
          value={nombreDesap}
          onChange={(e) => setNombreDesap(e.target.value)}
        />
      </label>
      <label className="block">
        <span className="font-bold">Edad</span>
        <input
          className="input mt-1"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={3}
          placeholder="Ej: 34"
          value={edadDesap}
          onChange={(e) => setEdadDesap(e.target.value.replace(/\D/g, ''))}
        />
      </label>
      {tipoSerDesap === 'persona' && (
        <label className="block">
          <span className="font-bold">
            Cédula (Venezuela) o RUT (Chile){' '}
            <span className="text-bandera-rojo">*</span>
          </span>
          <input
            className="input mt-1"
            placeholder="Ej: V-12345678 o 12.345.678-5"
            value={documentoDesap}
            onChange={(e) => setDocumentoDesap(e.target.value)}
          />
          <span className="text-xs text-gray-500 mt-1 block">
            Ayuda al equipo a verificar e identificar el caso. Es privado.
          </span>
        </label>
      )}
      <div>
        <p className="font-bold mb-1">
          Foto <span className="text-bandera-rojo">*</span>
        </p>
        {fotoDesapPreview ? (
          <div className="flex items-center gap-3">
            <img
              src={fotoDesapPreview}
              alt=""
              className="h-20 w-20 rounded-xl object-cover border"
            />
            <button
              type="button"
              onClick={() => {
                setFotoDesapFile(null)
                setFotoDesapPreview('')
              }}
              className="text-sm font-semibold text-bandera-rojo"
            >
              Quitar foto
            </button>
          </div>
        ) : (
          <label className="btn-gris inline-flex py-2 px-4 cursor-pointer">
            📷 Elegir foto
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (!f) return
                setFotoDesapFile(f)
                setFotoDesapPreview(URL.createObjectURL(f))
              }}
            />
          </label>
        )}
        <p className="text-[11px] text-gray-500 mt-1">
          La foto se comprime automáticamente para que pese poco.
        </p>
      </div>
    </div>
  )

  const bloqueContacto = (
    <div>
      <p className="font-bold mb-1">
        Teléfono de contacto <span className="text-bandera-rojo">*</span>
      </p>
      <p className="text-xs text-gray-600 mb-2">
        📱 <strong>Obligatorio.</strong> Es la forma de que un rescatista o
        voluntario te llame o te escriba por WhatsApp.<br />Es <strong>privado</strong>: solo lo ve quien te
        ayuda, nunca aparece en el mapa público.
      </p>
      <EntradaTelefono valor={contacto} onChange={setContacto} requerido />
    </div>
  )

  const bloqueDatosPsicologia = (
    <div className="space-y-3 rounded-2xl border border-purple-100 bg-purple-50/60 p-3">
      <p className="text-sm text-purple-950">
        Queremos llamarte por tu nombre y cuidar tu caso con respeto. Estos datos
        ayudan a que el equipo pueda identificarte y contactarte sin exponerte en
        el mapa público.
      </p>
      <label className="block">
        <span className="font-bold">
          ¿Cómo te llamas? <span className="text-bandera-rojo">*</span>
        </span>
        <input
          className="input mt-1"
          placeholder="Nombre y apellido"
          value={nombrePaciente}
          onChange={(e) => setNombrePaciente(e.target.value)}
        />
      </label>
      <label className="block">
        <span className="font-bold">Tu edad</span>
        <input
          className="input mt-1"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={3}
          placeholder="Ej: 34"
          value={edadPaciente}
          onChange={(e) => setEdadPaciente(e.target.value.replace(/\D/g, ''))}
        />
        <span className="text-xs text-gray-500 mt-1 block">
          Ayuda al equipo a preparar mejor el acompañamiento.
        </span>
      </label>
      <label className="block">
        <span className="font-bold">
          Cédula (Venezuela) o RUT (Chile){' '}
          <span className="text-bandera-rojo">*</span>
        </span>
        <input
          className="input mt-1"
          placeholder="Ej: V-12345678 o 12.345.678-5"
          value={cedulaPaciente}
          onChange={(e) => setCedulaPaciente(e.target.value)}
        />
        <span className="text-xs text-gray-500 mt-1 block">
          Ayuda al equipo a verificar e identificar tu caso.
        </span>
      </label>
    </div>
  )

  // El teléfono de psicología va en su propio tramo (el último), como en el
  // resto de reportes: así ninguna pantalla obliga a desplazarse.
  const bloqueContactoPsicologia = (
    <div>
      <p className="font-bold mb-1">
        Un teléfono donde podamos contactarte{' '}
        <span className="text-bandera-rojo">*</span>
      </p>
      <p className="text-xs text-gray-600 mb-2">
        Es privado y solo lo verá el equipo psicológico para coordinar el
        primer contacto contigo.
      </p>
      <EntradaTelefono valor={contacto} onChange={setContacto} requerido />
    </div>
  )

  const selectorUrgencia = (
    <div>
      <p className="font-bold mb-2">Urgencia</p>
      <div className="grid grid-cols-3 gap-2">
        {URGENCIAS.map((u) => (
          <button
            key={u.v}
            onClick={() => setUrgencia(u.v)}
            className={`${u.clase} ${
              urgencia === u.v ? 'ring-4 ring-black/20' : 'opacity-80'
            }`}
          >
            {u.etiqueta}
          </button>
        ))}
      </div>
    </div>
  )

  const avisoError = errorMsg && (
    <div className="rounded-xl border-2 border-bandera-rojo bg-red-50 p-3 text-sm font-semibold text-bandera-rojo">
      ⚠️ {errorMsg}
    </div>
  )

  // Textos por tipo.
  const intro = esDerrumbe
    ? '🏚️ Reporta un edificio o departamento colapsado. Indica la dirección y ajusta el pin al lugar exacto.'
    : esZona
      ? null // la zona lleva su propio aviso con <strong>
      : esAtencionPsicologica
        ? '💙 Si sobreviviste al terremoto, si perdiste a alguien, si tienes miedo, ansiedad, insomnio o solo necesitas hablar, no estás solo/a. Este espacio es para pedir apoyo psicológico con calma, respeto y privacidad.'
      : esHospital
        ? '🏥 Registra un hospital para que aparezca en el mapa y en el filtro de hospitales.'
        // Sin aviso genérico: con el flujo por pasos, el título "¿Dónde es?"
        // ya dice de qué trata esta pantalla. Repetirlo solo alargaba la
        // vista y obligaba a hacer scroll.
        : null

  const etiquetaDir = esDerrumbe
    ? 'Dirección del edificio'
    : esZona
      ? 'Dirección o referencia de la zona'
      : esHospital
        ? 'Dirección del hospital'
        : esDesaparecido
          ? 'Dónde se le vio por última vez'
        // No es opcional (hace falta el pin o esta dirección): se quita la
        // aclaración equivocada. Va más chica porque el mapa de abajo ya dice
        // "arrastra el pin"; no hace falta repetir la idea dos veces.
        : 'Dirección o lugar'

  const placeholderDir = esDerrumbe
    ? 'Calle, número, edificio, urbanización...'
    : esZona
      ? 'Sector, urbanización, pueblo, carretera...'
      : esHospital
        ? 'Calle, avenida, sector o referencia'
        : esDesaparecido
          ? 'Sector, calle, pueblo, referencia...'
        : 'Calle, número, sector, referencia...'

  const etiquetaDetalle =
    esHospital
      ? 'Información adicional (opcional)'
      : esAtencionPsicologica
        ? 'Cuéntanos, con tus palabras, qué estás viviendo'
      : esDerrumbe || esZona ? 'Detalles (opcional)' : '¿Qué necesitas?'

  const placeholderDetalle = esDerrumbe
    ? 'Ej: 4 pisos, posible gente atrapada en el 2do'
    : esZona
      ? 'Ej: caseríos incomunicados tras el derrumbe de la vía'
      : esAtencionPsicologica
        ? 'Ej: No puedo dormir, siento mucha angustia, perdí a un familiar, necesito hablar con alguien...'
      : esHospital
        ? 'Ej: emergencia, triaje, disponibilidad, referencia de acceso'
        : 'Ej: Familia con 2 niños sin agua desde ayer'

  const titulo =
    paso > 1 ? metaTipo.etiqueta : 'Reportar necesidad'
  return (
    <div className="fixed inset-0 z-[2000] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-5 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-extrabold text-bandera-azul">{titulo}</h2>
          <button
            onClick={onCerrar}
            className="text-2xl text-gray-400 leading-none"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        {/* PASO 1-A: bloques grandes (pocas opciones, lenguaje de persona) */}
        {paso === 1 && !grupo && !pasoPersonaAnimal && (
          <div className="space-y-2">
            <div className="flex items-center justify-between mb-1">
              <p className="font-bold">¿Qué deseas reportar?</p>
              {/* Ayuda emocional aparte, chica: no es un reporte de daño
                  material y no debe competir por espacio con esos bloques.
                  Lleva su propio texto (no solo el ícono) para que se
                  entienda de un vistazo qué es. */}
              <button
                type="button"
                onClick={() => elegirTipo('atencion_psicologica')}
                aria-label="Me siento mal, quiero hablar"
                title="Me siento mal, quiero hablar"
                className="shrink-0 flex items-center gap-1.5 rounded-full bg-purple-50 pl-2.5 pr-3 py-1.5 text-purple-700 transition-colors hover:bg-purple-100"
              >
                <Heart className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="text-xs font-bold leading-tight">
                  Quiero hablar
                </span>
              </button>
            </div>

            {GRUPOS.map((g) => (
              <BloqueOpcion
                key={g.v}
                icono={g.icono}
                titulo={g.titulo}
                ejemplos={g.ejemplos}
                onClick={() => setGrupo(g.v)}
                flecha
              />
            ))}

            <BloqueOpcion
              icono={UserSearch}
              color={DESAPARECIDO_META.color}
              titulo="Persona o mascota"
              ejemplos="Perdida, desaparecida o necesita ayuda"
              onClick={() => setPasoPersonaAnimal('elegir')}
            />

            {/* Salidas poco frecuentes: presentes, pero sin competir con las
                opciones grandes de arriba. */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => elegirTipo('otro')}
                className="rounded-xl px-3 py-2 text-sm font-semibold text-tinta-600 transition-colors hover:bg-tinta-50 hover:text-bandera-azul"
              >
                ¿Otra cosa? Reportar algo distinto
              </button>
              {puedeReportarHospital && (
                <button
                  type="button"
                  onClick={() => elegirTipo('hospital')}
                  className="ml-auto inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-tinta-500 transition-colors hover:bg-tinta-50"
                >
                  <ICONO_HOSPITAL className="h-4 w-4" aria-hidden="true" />
                  Registrar un hospital
                </button>
              )}
            </div>
          </div>
        )}

        {/* Bloque combinado "Persona o mascota": a quién busca, y si es
            mascota, si está perdida o solo necesita ayuda estando presente. */}
        {paso === 1 && pasoPersonaAnimal === 'elegir' && (
          <div className="space-y-2">
            <p className="font-bold mb-1">¿Es una persona o una mascota?</p>
            <button
              type="button"
              onClick={() => {
                setTipoSerDesap('persona')
                setPasoPersonaAnimal(null)
                elegirTipo('desaparecido')
              }}
              className="w-full flex items-center gap-3 text-left rounded-2xl border-2 border-purple-200 bg-purple-50/60 p-3.5 hover:border-bandera-azul"
            >
              <User className="h-6 w-6 text-purple-700 shrink-0" aria-hidden="true" />
              <span className="font-extrabold text-purple-950">Es una persona</span>
            </button>
            <button
              type="button"
              onClick={() => setPasoPersonaAnimal('mascota')}
              className="w-full flex items-center gap-3 text-left rounded-2xl border-2 border-purple-200 bg-purple-50/60 p-3.5 hover:border-bandera-azul"
            >
              <PawPrint className="h-6 w-6 text-purple-700 shrink-0" aria-hidden="true" />
              <span className="font-extrabold text-purple-950">Es una mascota</span>
            </button>
            <button
              onClick={() => setPasoPersonaAnimal(null)}
              className="btn-gris w-full"
            >
              ← Atrás
            </button>
          </div>
        )}

        {paso === 1 && pasoPersonaAnimal === 'mascota' && (
          <div className="space-y-2">
            <p className="font-bold mb-1">¿Está perdida o necesita ayuda?</p>
            <button
              type="button"
              onClick={() => {
                setTipoSerDesap('mascota')
                setPasoPersonaAnimal(null)
                elegirTipo('desaparecido')
              }}
              className="w-full flex items-center gap-3 text-left rounded-2xl border-2 border-purple-200 bg-purple-50/60 p-3.5 hover:border-bandera-azul"
            >
              <UserSearch className="h-6 w-6 text-purple-700 shrink-0" aria-hidden="true" />
              <span className="font-extrabold text-purple-950">
                Está perdida o desaparecida
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                setPasoPersonaAnimal(null)
                elegirTipo('mascota')
              }}
              className="w-full flex items-center gap-3 text-left rounded-2xl border-2 border-purple-200 bg-purple-50/60 p-3.5 hover:border-bandera-azul"
            >
              <PawPrint className="h-6 w-6 text-purple-700 shrink-0" aria-hidden="true" />
              <span className="font-extrabold text-purple-950">
                Está aquí, pero necesita ayuda
              </span>
            </button>
            <button
              onClick={() => setPasoPersonaAnimal('elegir')}
              className="btn-gris w-full"
            >
              ← Atrás
            </button>
          </div>
        )}

        {/* PASO 1-B: opciones del grupo elegido */}
        {paso === 1 && grupoAbierto && (
          <div className="space-y-2">
            <p className="font-bold mb-1 flex items-center gap-2 text-tinta-800">
              <grupoAbierto.icono className="h-5 w-5 text-tinta-500" aria-hidden="true" />
              {grupoAbierto.titulo}
            </p>
            {tiposDelGrupo.map((t) => (
              <BloqueOpcion
                key={t}
                icono={ICONO_TIPO[t]}
                color={TIPO_META[t].color}
                titulo={TIPO_META[t].etiqueta}
                onClick={() => elegirTipo(t)}
              />
            ))}
            <button
              type="button"
              onClick={() => setGrupo(null)}
              className="btn-gris w-full mt-2"
            >
              ← Atrás
            </button>
          </div>
        )}

        {/* AYUDA EMOCIONAL — antes del formulario: ¿quién eres? Dos grandes
            preguntas + contacto directo con el equipo aliado (Praxis). */}
        {paso > 1 && esAtencionPsicologica && !perfilPsico && (
          <div className="space-y-2">
            <div className="rounded-xl bg-purple-50 border border-purple-200 p-2.5 text-sm text-purple-900">
              💙 ¿Emergencia inmediata? Llama ya: 911 (Venezuela) o 131
              (Chile). Esta red no reemplaza atención de urgencia.
            </div>

            <p className="font-bold">¿Con cuál situación te identificas?</p>

            <button
              type="button"
              onClick={() => setPerfilPsico('rescatista')}
              className="w-full flex items-center gap-3 text-left rounded-2xl border-2 border-purple-200 bg-purple-50/60 p-3.5 hover:border-bandera-azul"
            >
              <Ambulance className="h-6 w-6 text-purple-700 shrink-0" aria-hidden="true" />
              <span className="font-extrabold text-purple-950">
                Soy rescatista o voluntario/a agotado/a
              </span>
            </button>

            <button
              type="button"
              onClick={() => setPerfilPsico('a_distancia')}
              className="w-full flex items-center gap-3 text-left rounded-2xl border-2 border-purple-200 bg-purple-50/60 p-3.5 hover:border-bandera-azul"
            >
              <Globe className="h-6 w-6 text-purple-700 shrink-0" aria-hidden="true" />
              <span className="font-extrabold text-purple-950">
                Estoy fuera de la zona, pero me está afectando
              </span>
            </button>

            <button
              type="button"
              onClick={() => setPerfilPsico('en_zona')}
              className="w-full flex items-center gap-3 text-left rounded-2xl border-2 border-purple-200 bg-purple-50/60 p-3.5 hover:border-bandera-azul"
            >
              <HeartHandshake className="h-6 w-6 text-purple-700 shrink-0" aria-hidden="true" />
              <span className="font-extrabold text-purple-950">
                Estoy en la zona afectada
              </span>
            </button>

            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3">
              <p className="text-sm font-bold text-gray-800">
                ¿Prefieres hablar ya con alguien?
              </p>
              <p className="text-sm font-bold text-bandera-azul mt-1">
                📞 {PRAXIS_TELEFONO}
              </p>
              <div className="flex gap-2 mt-2">
                <a
                  href={`tel:${PRAXIS_TELEFONO.replace(/[^\d+]/g, '')}`}
                  className="btn-azul flex-1 py-2 text-sm text-center no-underline"
                >
                  📞 Llamar
                </a>
                <a
                  href={`https://wa.me/${PRAXIS_TELEFONO.replace(/\D/g, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-verde flex-1 py-2 text-sm text-center no-underline"
                >
                  💬 WhatsApp
                </a>
              </div>
            </div>

            <button onClick={() => setPaso(1)} className="btn-gris w-full">
              ← Atrás
            </button>
          </div>
        )}

        {/* DESAPARECIDO — antes del formulario: ¿persona o mascota? Define
            qué campos pedir (el documento solo aplica a personas). */}
        {paso > 1 && esDesaparecido && !tipoSerDesap && (
          <div className="space-y-2">
            <p className="font-bold">¿Es una persona o una mascota?</p>
            <button
              type="button"
              onClick={() => setTipoSerDesap('persona')}
              className="w-full flex items-center gap-3 text-left rounded-2xl border-2 border-purple-200 bg-purple-50/60 p-3.5 hover:border-bandera-azul"
            >
              <User className="h-6 w-6 text-purple-700 shrink-0" aria-hidden="true" />
              <span className="font-extrabold text-purple-950">Es una persona</span>
            </button>
            <button
              type="button"
              onClick={() => setTipoSerDesap('mascota')}
              className="w-full flex items-center gap-3 text-left rounded-2xl border-2 border-purple-200 bg-purple-50/60 p-3.5 hover:border-bandera-azul"
            >
              <PawPrint className="h-6 w-6 text-purple-700 shrink-0" aria-hidden="true" />
              <span className="font-extrabold text-purple-950">Es una mascota</span>
            </button>
            <button onClick={() => setPaso(1)} className="btn-gris w-full">
              ← Atrás
            </button>
          </div>
        )}

        {/* PASO 2: reportes comunes en 3 tramos (¿dónde? · ¿qué pasa? ·
            ¿teléfono?). Hospital, apoyo emocional y mascota conservan su
            pantalla única: sus campos propios no encajan en este recorrido. */}
        {paso > 1 &&
          !(esAtencionPsicologica && !perfilPsico) &&
          !(esDesaparecido && !tipoSerDesap) && (
          <div className="space-y-3">
            {usaPasos && (
              <div>
                <div
                  className="flex items-center gap-1.5 mb-2"
                  role="progressbar"
                  aria-valuenow={subPaso}
                  aria-valuemin={1}
                  aria-valuemax={3}
                  aria-label={`Paso ${subPaso} de 3`}
                >
                  {[1, 2, 3].map((n) => (
                    <span
                      key={n}
                      className={`h-1.5 flex-1 rounded-full ${
                        n <= subPaso ? 'bg-bandera-azul' : 'bg-gray-200'
                      }`}
                    />
                  ))}
                </div>
                <p className="font-extrabold text-lg leading-tight">
                  {subPaso === 1
                    ? esAtencionPsicologica
                      ? '¿Quién eres?'
                      : esDesaparecido
                        ? '¿Quién es?'
                        : '¿Dónde es?'
                    : subPaso === 2
                      ? esAtencionPsicologica
                        ? '¿Qué estás viviendo?'
                        : esDesaparecido
                          ? '¿Dónde se le vio por última vez?'
                          : '¿Qué pasa?'
                      : '¿Cómo te contactamos?'}
                </p>
              </div>
            )}

            {/* Sin aviso genérico: solo se muestra cuando hay algo que de
                verdad hace falta aclarar (zona aislada, zona, derrumbe,
                hospital, apoyo emocional). El título del paso ya dice de qué
                trata la pantalla. */}
            {enTramo(1) && (esZonaAislada || esZona || intro) && (
            <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-800">
              {esZonaAislada ? (
                <>
                  🚧 Marca una <strong>zona aislada</strong> (incomunicada o de
                  difícil acceso) para que el equipo la vea de un vistazo en el
                  mapa. Solo el admin y los líderes de voluntarios pueden
                  crearlas.
                </>
              ) : esZona ? (
                <>
                  🚩 Marca una <strong>zona</strong> donde aún no ha llegado
                  ayuda, para que rescatistas y voluntarios sepan dónde ir. Se
                  verá en el mapa como un círculo.
                </>
              ) : (
                intro
              )}
            </div>
            )}

            {esHospital && (
              <div>
                <p className="font-bold mb-2">
                  Nombre del hospital <span className="text-bandera-rojo">*</span>
                </p>
                <input
                  className="input"
                  placeholder="Ej: Hospital Jose Maria Vargas"
                  value={nombreHospital}
                  onChange={(e) => setNombreHospital(e.target.value)}
                />
                {buscandoHospital && (
                  <p className="text-xs text-gray-500 mt-1">
                    Buscando en Google Maps...
                  </p>
                )}
                {seleccionandoHospital && (
                  <p className="text-xs text-gray-500 mt-1">
                    Confirmando lugar en Google Maps...
                  </p>
                )}
                {!buscandoHospital &&
                  !seleccionandoHospital &&
                  nombreHospital.trim().length >= 3 &&
                  !hospitalConfirmado &&
                  sugerenciasHospital.length === 0 && (
                    <p className="text-xs text-bandera-rojo font-semibold mt-1">
                      No encontramos un hospital confirmado con ese nombre.
                    </p>
                  )}
                {!hospitalConfirmado && sugerenciasHospital.length > 0 && (
                  <div className="mt-2 rounded-xl border border-gray-200 overflow-hidden">
                    {sugerenciasHospital.map((h) => (
                      <button
                        key={h.placeId}
                        type="button"
                        onClick={async () => {
                          setSeleccionandoHospital(true)
                          setErrorMsg('')
                          const detalle = await detalleLugarGoogle(h.placeId)
                          setSeleccionandoHospital(false)
                          if (!detalle?.lat || !detalle?.lng) {
                            setErrorMsg(
                              'No pudimos confirmar ese lugar en Google Maps. Elige otro resultado.',
                            )
                            return
                          }
                          setHospitalConfirmado(detalle)
                          setNombreHospital(detalle.nombre)
                          setZona(detalle.direccion)
                          setCoord({ lat: detalle.lat, lng: detalle.lng })
                          setFuente(null)
                          setSugerenciasHospital([])
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-blue-50 border-b last:border-b-0"
                      >
                        <span className="block text-sm font-bold text-bandera-azul">
                          {h.nombre}
                        </span>
                        <span className="block text-xs text-gray-600">
                          {h.direccion}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {hospitalConfirmado && (
                  <p className="text-xs text-green-700 font-semibold mt-1">
                    Hospital confirmado por Google Maps.
                  </p>
                )}
              </div>
            )}

            {esAtencionPsicologica && enTramo(1) && bloqueDatosPsicologia}

            {esDesaparecido && enTramo(1) && bloqueDatosDesaparecido}

            {esMascota && enTramo(2) && bloqueDatosMascota}

            {requiereUbicacion && enTramo(esDesaparecido ? 2 : 1) && (
              <div>
                <p
                  className={
                    esDerrumbe || esZona || esHospital || esDesaparecido
                      ? 'font-bold mb-2'
                      : 'text-xs font-semibold text-gray-500 mb-1'
                  }
                >
                  {etiquetaDir}
                </p>
                <input
                  className={`input ${esHospital ? 'bg-gray-50 text-gray-700' : ''}`}
                  placeholder={placeholderDir}
                  value={zona}
                  readOnly={esHospital}
                  onChange={(e) => setZona(e.target.value)}
                />
                {esHospital && (
                  <p className="text-xs text-gray-500 mt-1">
                    Se completa al seleccionar un hospital confirmado por Google Maps.
                  </p>
                )}
              </div>
            )}

            {esZona && enTramo(1) && (
              <div>
                <p className="font-bold mb-2">Tamaño de la zona (diámetro)</p>
                <div className="grid grid-cols-3 gap-2">
                  {TAMANOS_ZONA.map((km) => (
                    <button
                      key={km}
                      onClick={() => setTamZonaKm(km)}
                      className={`btn-gris py-2.5 ${
                        tamZonaKm === km
                          ? 'ring-4 ring-bandera-azul/30 font-bold'
                          : 'opacity-80'
                      }`}
                    >
                      {km} km
                    </button>
                  ))}
                </div>
              </div>
            )}

            {requiereUbicacion &&
              enTramo(esDesaparecido ? 2 : 1) &&
              bloqueUbicacionMapa}

            {!esDesaparecido && enTramo(2) && (
              <div>
                <p className="font-bold mb-2">{etiquetaDetalle}</p>
                <textarea
                  className="input min-h-[70px]"
                  placeholder={placeholderDetalle}
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                />
              </div>
            )}

            {!esHospital &&
              !esAtencionPsicologica &&
              !esDesaparecido &&
              enTramo(2) &&
              selectorUrgencia}
            {/* La catástrofe ya no se pregunta: se asigna sola según el país
                y la ciudad del reporte (la define la coordinación en el
                panel). Un formulario menos para quien pide ayuda. */}
            {!esHospital &&
              !esAtencionPsicologica &&
              enTramo(3) &&
              bloqueContacto}
            {esAtencionPsicologica && enTramo(3) && bloqueContactoPsicologia}
            {avisoError}

            {usaPasos ? (
              <div className="flex gap-2">
                <button
                  onClick={() =>
                    subPaso === 1 ? setPaso(1) : setSubPaso(subPaso - 1)
                  }
                  className="btn-gris flex-1"
                >
                  ← Atrás
                </button>
                {subPaso < 3 ? (
                  <button
                    onClick={() => setSubPaso(subPaso + 1)}
                    // El punto es lo único imprescindible del primer tramo:
                    // sin él (ni dirección escrita) no se puede seguir.
                    disabled={!tramoCompleto}
                    className="btn-azul flex-1 disabled:opacity-60"
                  >
                    {subPaso === 1 && !esAtencionPsicologica && !esDesaparecido
                      ? '✅ Es aquí'
                      : 'Siguiente →'}
                  </button>
                ) : (
                  <button
                    onClick={enviar}
                    disabled={guardando}
                    className="btn-verde flex-1 disabled:opacity-60"
                  >
                    {guardando ? 'Enviando…' : 'Enviar reporte'}
                  </button>
                )}
              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={() =>
                    esAtencionPsicologica && perfilPsico
                      ? setPerfilPsico('')
                      : setPaso(1)
                  }
                  className="btn-gris flex-1"
                >
                  ← Atrás
                </button>
                <button
                  onClick={enviar}
                  disabled={guardando}
                  className="btn-verde flex-1 disabled:opacity-60"
                >
                  {guardando
                    ? 'Enviando…'
                    : esHospital
                      ? 'Guardar hospital'
                      : 'Enviar reporte'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Bloque grande de la primera pantalla de "Reportar": objetivo táctil amplio,
 * texto legible y una sola idea por fila, para que se entienda de un vistazo
 * incluso con estrés o poca vista.
 */
function BloqueOpcion({
  icono: Icono,
  color,
  titulo,
  ejemplos,
  onClick,
  flecha = false,
}: {
  /** Icono de trazo (lucide). Un solo color: nada de emojis multicolor. */
  icono: LucideIcon
  /** Color del tipo (TIPO_META). Tiñe el disco del icono, muy diluido. */
  color?: string
  titulo: string
  ejemplos?: string
  onClick: () => void
  /** Muestra "›" cuando el bloque abre otra lista en vez de un formulario. */
  flecha?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group w-full flex items-center gap-4 rounded-2xl border border-tinta-200 bg-white p-4 text-left shadow-suave
                 transition-all duration-200 ease-suave
                 hover:border-bandera-azul/40 hover:shadow-media hover:-translate-y-[1px]
                 active:translate-y-0 active:scale-[0.99]"
    >
      {/* El icono sobre un disco apenas teñido con el color del tipo: da
          peso, alinea las filas y mete el color con cuentagotas (un fondo
          saturado se vería de juguete). */}
      <span
        className="h-12 w-12 shrink-0 grid place-items-center rounded-xl transition-colors duration-200"
        style={{
          backgroundColor: color ? `${color}14` : '#F0F1F5',
          color: color ?? '#4B5468',
        }}
        aria-hidden="true"
      >
        <Icono className="h-6 w-6" strokeWidth={2} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-extrabold text-base leading-tight text-tinta-800">
          {titulo}
        </span>
        {ejemplos && (
          <span className="block text-sm text-tinta-500 leading-snug mt-0.5">
            {ejemplos}
          </span>
        )}
      </span>
      {flecha && (
        <span
          className="text-2xl text-tinta-300 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5"
          aria-hidden="true"
        >
          ›
        </span>
      )}
    </button>
  )
}
