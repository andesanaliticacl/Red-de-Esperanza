import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  Heart,
  Ambulance,
  Package,
  MapPin,
  Eye,
  EyeOff,
  TriangleAlert,
  UserRoundPlus,
  MailCheck,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { obtenerUbicacion, lugarPorCoordenadas } from '../lib/geo'
import EntradaTelefono, {
  esTelefonoValido,
  mensajeTelefono,
} from '../components/EntradaTelefono'
import RolesInfoModal from '../components/RolesInfoModal'
import SelectorBandera from '../components/SelectorBandera'
import { PAISES_MUNDO } from '../lib/paises'
import { zonasDePais, ciudadesDeZona } from '../lib/zonas'
import {
  validarDocumentoPsicologo,
  validarDocumentoPersona,
  validarIdFiscal,
} from '../lib/documentos'
import { type RolRegistro, type TipoDocumento } from '../lib/types'
import {
  CATEGORIA_META,
  CATEGORIAS_ORDEN,
  PROFESIONES,
  PROFESION_PSICOLOGO,
  PROFESION_OTRA,
  type CategoriaEntidad,
} from '../lib/entidades'
import { ICONO_CATEGORIA_ENTIDAD } from '../lib/iconosTipo'

const OPCIONES_PAIS = PAISES_MUNDO.map((p) => ({
  value: p.nombre,
  iso: p.iso,
  etiqueta: p.nombre,
}))

/** Minúsculas y sin tildes, para comparar nombres de lugares. */
function normalizarLugar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

/**
 * Busca en `opciones` la que corresponde al nombre detectado por GPS. No
 * coinciden literalmente: OpenStreetMap devuelve "Región de Coquimbo" y la
 * lista dice "Coquimbo", así que aceptamos que una contenga a la otra.
 * Exige 4+ letras para no emparejar por casualidad con nombres cortos.
 */
function buscarCoincidencia(
  detectado: string | null,
  opciones: readonly string[],
): string | null {
  if (!detectado) return null
  const d = normalizarLugar(detectado)
  if (d.length < 4) return null
  return (
    opciones.find((o) => {
      const n = normalizarLugar(o)
      return n.length >= 4 && (d.includes(n) || n.includes(d))
    }) ?? null
  )
}

// "¿Cómo quieres participar?": solo 4 tarjetas, en lenguaje natural (no
// técnico). "Ciudadano" ya no es una opción de registro: quien solo quiere
// ver el mapa no necesita cuenta.
//
// La cuarta tarjeta ("Represento una entidad") abre un segundo paso con las
// categorías. Psicólogo/a vive DENTRO de ese paso, como una profesión más:
// una sola puerta visible para quien se registra, aunque por detrás siga
// yendo a su circuito propio (ver esPsicologo más abajo).
type OpcionParticipar = 'voluntario' | 'rescatista' | 'centro_acopio' | 'entidad'

/** Pantallas del registro. Cuáles se muestran depende del camino elegido. */
type PasoRegistro =
  | 'participar'
  | 'categoria'
  | 'organizacion'
  | 'facturacion'
  | 'lugar'
  | 'identidad'
  | 'cuenta'
const OPCIONES_PARTICIPAR: {
  v: OpcionParticipar
  icono: LucideIcon
  titulo: string
  descripcion: string
}[] = [
  {
    v: 'voluntario',
    icono: Heart,
    titulo: 'Voluntario',
    descripcion: 'Apoyo a atender y coordinar reportes.',
  },
  {
    v: 'rescatista',
    icono: Ambulance,
    titulo: 'Soy rescatista',
    descripcion: 'Atiendo rescates y emergencias en terreno.',
  },
  {
    v: 'centro_acopio',
    icono: Package,
    titulo: 'Represento un centro de acopio',
    descripcion: 'Gestiono donaciones y suministros.',
  },
  {
    v: 'entidad',
    icono: ShieldCheck,
    titulo: 'Represento una entidad o soy profesional',
    descripcion: 'Bomberos, municipalidad, rescate, ONG, psicólogo/a…',
  },
]

// Convierte el error de Supabase en un mensaje claro en español.
// Siempre deja el detalle crudo en la consola para poder diagnosticar.
function mensajeDeError(error: unknown): string {
  console.error('[registro] error completo:', error)
  const crudo =
    (typeof error === 'object' &&
      error !== null &&
      'message' in error &&
      typeof (error as { message: unknown }).message === 'string' &&
      (error as { message: string }).message) ||
    ''
  const t = crudo.toLowerCase()
  if (t.includes('already registered') || t.includes('already been registered'))
    return 'Ya existe una cuenta con este correo. Inicia sesión.'
  if (t.includes('invalid') && t.includes('email'))
    return 'El correo no tiene un formato válido.'
  if (t.includes('password'))
    return 'La contraseña no cumple los requisitos (mínimo 6 caracteres).'
  if (t.includes('database error') || t.includes('saving new user'))
    return 'No pudimos guardar tu cuenta en el servidor. Revisa que todos los campos estén completos e inténtalo de nuevo.'
  if (t.includes('failed to fetch') || t.includes('network'))
    return 'Sin conexión con el servidor. Revisa tu internet e inténtalo otra vez.'
  if (t.includes('rate limit') || t.includes('too many'))
    return 'Demasiados intentos seguidos. Espera unos minutos e inténtalo de nuevo.'
  return crudo || 'Ocurrió un error inesperado al crear la cuenta. Revisa la consola (F12) para más detalle.'
}

// Opciones válidas para preseleccionar vía "?rol=" (acceso directo). No
// incluye 'ciudadano' (ya no es una tarjeta de registro) ni 'entidad' (esa
// necesita elegir categoría; el atajo del mapa entra con "?psicologo=1").
const ROLES_VALIDOS: Exclude<OpcionParticipar, 'entidad'>[] = [
  'voluntario',
  'rescatista',
  'centro_acopio',
]

export default function RegistroView() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  // Rol preseleccionado si vino desde un acceso directo del inicio.
  const rolInicial = searchParams.get('rol')
  // Acceso rápido "Psicólogo/a" del mapa: preactiva el pedido de revisión.
  const psicologoInicial = searchParams.get('psicologo') === '1'
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  // Selección única entre las 4 tarjetas de "¿Cómo quieres participar?".
  const [participa, setParticipa] = useState<OpcionParticipar>(
    psicologoInicial
      ? 'entidad'
      : ROLES_VALIDOS.includes(rolInicial as (typeof ROLES_VALIDOS)[number])
        ? (rolInicial as (typeof ROLES_VALIDOS)[number])
        : 'voluntario',
  )
  // Segundo paso de "Represento una entidad": qué tipo, y si es una persona,
  // qué profesión. El acceso rápido "?psicologo=1" del mapa cae aquí ya
  // resuelto, para que ese atajo siga funcionando igual que antes.
  const [categoria, setCategoria] = useState<CategoriaEntidad | ''>(
    psicologoInicial ? 'profesional' : '',
  )
  const [profesion, setProfesion] = useState(
    psicologoInicial ? PROFESION_PSICOLOGO : '',
  )
  // Al elegir "Otra" se escribe cuál: guardar el literal "Otra" no le dice
  // nada a quien después busque a alguien por lo que sabe hacer.
  const [profesionOtra, setProfesionOtra] = useState('')
  const [nombreEntidad, setNombreEntidad] = useState('')
  const [descripcionEntidad, setDescripcionEntidad] = useState('')
  const [webEntidad, setWebEntidad] = useState('')
  // Datos de facturación. Se piden SOLO a las categorías que se cobran
  // (municipalidad, empresa): perseguirlos después de aprobar no funciona
  // nunca, y sin ellos no se puede emitir la factura.
  const [razonSocial, setRazonSocial] = useState('')
  const [idFiscal, setIdFiscal] = useState('')
  const [direccionFiscal, setDireccionFiscal] = useState('')
  const [contactoFacturacion, setContactoFacturacion] = useState('')

  // Psicólogo/a se pide desde la lista de profesiones, pero conserva su
  // circuito propio (solicitudes_psicologo), que ya trae la asignación y el
  // seguimiento de pacientes.
  const esPsicologo =
    participa === 'entidad' &&
    categoria === 'profesional' &&
    profesion === PROFESION_PSICOLOGO
  const quierePsicologo = esPsicologo
  // Entidad de verdad (todo lo que no sea el desvío a psicología).
  const esEntidad = participa === 'entidad' && !esPsicologo
  // Para una entidad, el nombre público es el de la organización; si es una
  // persona que ofrece su profesión, es su propio nombre.
  const nombrePublicoEntidad =
    categoria === 'profesional' ? nombre.trim() : nombreEntidad.trim()
  /** La profesión que de verdad se guarda: con "Otra", la que escribió. */
  const profesionFinal =
    profesion === PROFESION_OTRA ? profesionOtra.trim() : profesion
  // ¿Esta categoría se factura? Define si se piden los datos fiscales.
  const pideFacturacion =
    esEntidad && !!categoria && CATEGORIA_META[categoria].facturablePorDefecto

  // Rol con el que NACE la cuenta:
  //  · psicólogo/a → colaborador/a mientras el equipo revisa (como siempre).
  //  · entidad → 'ciudadano' A PROPÓSITO: 'voluntario' da acceso de lectura a
  //    los teléfonos privados de los reportes (política "leer contacto
  //    interno"), y eso no puede otorgarse ANTES de verificar quién es. El
  //    rol 'entidad' lo pone revisar_solicitud_entidad() al aprobar.
  const rol: Exclude<RolRegistro, 'psicologo'> =
    participa === 'entidad'
      ? esPsicologo
        ? 'voluntario'
        : 'ciudadano'
      : participa
  // Chile por defecto: es la emergencia activa ahora mismo (se puede cambiar).
  const [pais, setPais] = useState('Chile')
  const [tipoDoc, setTipoDoc] = useState<TipoDocumento>('cedula')
  const [documento, setDocumento] = useState('')
  const [telefono, setTelefono] = useState('')
  const [estado, setEstado] = useState('')
  const [ciudad, setCiudad] = useState('')
  // Cuando la ciudad no está en la lista sugerida, se escribe a mano.
  const [ciudadOtra, setCiudadOtra] = useState(false)
  // Ubicación detectada sola al abrir, para no obligar a buscar la región en
  // una lista larga. Es una comodidad: todo queda editable.
  const [detectando, setDetectando] = useState(true)
  const [lugarDetectado, setLugarDetectado] = useState<string | null>(null)
  // Evita pisar lo que la persona ya escribió si el GPS tarda en responder.
  const tocadoPorUsuario = useRef(false)

  useEffect(() => {
    let vivo = true
    async function detectar() {
      try {
        const u = await obtenerUbicacion({ timeoutGps: 6000 })
        const lugar = await lugarPorCoordenadas(u.lat, u.lng)
        if (!vivo || !lugar || tocadoPorUsuario.current) return

        const paisEncontrado = buscarCoincidencia(
          lugar.pais,
          PAISES_MUNDO.map((p) => p.nombre),
        )
        if (paisEncontrado) setPais(paisEncontrado)

        // La región depende del país, así que se resuelve con el recién
        // detectado (el estado de React aún no se ha actualizado aquí).
        const iso = PAISES_MUNDO.find(
          (p) => p.nombre === (paisEncontrado ?? pais),
        )?.iso
        const regionEncontrada = buscarCoincidencia(
          lugar.region,
          zonasDePais(iso).opciones,
        )
        if (regionEncontrada) setEstado(regionEncontrada)

        if (lugar.ciudad) {
          const sugeridas = ciudadesDeZona(iso, regionEncontrada ?? '')
          const ciudadEnLista = buscarCoincidencia(lugar.ciudad, sugeridas)
          if (ciudadEnLista) {
            setCiudad(ciudadEnLista)
          } else {
            // No está entre las sugeridas: se escribe tal cual la detectamos.
            setCiudadOtra(true)
            setCiudad(lugar.ciudad)
          }
        }

        setLugarDetectado(
          [lugar.ciudad, regionEncontrada ?? lugar.region, paisEncontrado]
            .filter(Boolean)
            .join(', '),
        )
      } catch {
        /* sin permiso de ubicación o sin red: se llena a mano, sin drama */
      } finally {
        if (vivo) setDetectando(false)
      }
    }
    void detectar()
    return () => {
      vivo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Divisiones del país elegido (Estado/Región/Provincia… con sus nombres).
  const isoPais = PAISES_MUNDO.find((p) => p.nombre === pais)?.iso
  const zona = zonasDePais(isoPais)
  // Ciudades sugeridas según la zona elegida (autocompletar, no obligatorio).
  const ciudadesSugeridas = ciudadesDeZona(isoPais, estado)

  const [verPass, setVerPass] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [listo, setListo] = useState<'no' | 'confirmar' | 'sesion'>('no')
  const [verRoles, setVerRoles] = useState(false)

  // ===== Recorrido por pasos =====
  // El registro era una sola pantalla larguísima que obligaba a desplazarse
  // sí o sí. Ahora es una pregunta por pantalla, como en Reportar: se sigue
  // mucho mejor bajo estrés y cada paso entra completo.
  //
  // Los pasos se calculan según el camino: quien entra como voluntario ve
  // cuatro; una municipalidad ve siete, porque hay más que preguntarle.
  const pasos: PasoRegistro[] = [
    'participar',
    ...(participa === 'entidad' ? (['categoria'] as PasoRegistro[]) : []),
    ...(participa === 'entidad' && categoria
      ? (['organizacion'] as PasoRegistro[])
      : []),
    ...(pideFacturacion ? (['facturacion'] as PasoRegistro[]) : []),
    'lugar',
    'identidad',
    'cuenta',
  ]
  const [pasoIdx, setPasoIdx] = useState(0)
  // Si el camino se acorta (p. ej. cambia de entidad a voluntario), el índice
  // podría quedar apuntando fuera de la lista.
  const idx = Math.min(pasoIdx, pasos.length - 1)
  const paso = pasos[idx]
  const esUltimo = idx === pasos.length - 1

  /** Lo imprescindible de cada paso, para no dejar avanzar en vacío y que el
   *  error salte al final, cuando ya se olvidó qué faltaba. */
  const pasoCompleto = (() => {
    switch (paso) {
      case 'participar':
        return true // siempre hay una tarjeta elegida
      case 'categoria':
        return !!categoria
      case 'organizacion':
        return categoria === 'profesional'
          ? !!profesionFinal
          : !!nombreEntidad.trim()
      case 'facturacion':
        // El identificador fiscal se comprueba de verdad (dígito verificador):
        // una factura emitida a un RUT inventado no sirve para nada.
        return (
          !!razonSocial.trim() && validarIdFiscal(pais, idFiscal).valido
        )
      case 'lugar':
        return !!pais && !!estado.trim() && !!ciudad.trim()
      case 'identidad':
        // El documento se valida para TODOS, no solo para psicólogos: en
        // Chile el RUT trae dígito verificador y se comprueba con su
        // fórmula, así que un número inventado no pasa.
        return (
          !!nombre.trim() &&
          validarDocumentoPersona(pais, tipoDoc, documento).valido
        )
      case 'cuenta':
        return (
          !!email.trim() && password.length >= 6 && esTelefonoValido(telefono)
        )
      default:
        return true
    }
  })()

  const TITULOS: Record<PasoRegistro, string> = {
    participar: '¿Cómo quieres participar?',
    categoria: '¿Qué representas?',
    organizacion:
      categoria === 'profesional' ? '¿Cuál es tu profesión?' : 'Tu organización',
    facturacion: 'Datos para facturar',
    lugar: '¿Dónde estás?',
    identidad: '¿Quién eres?',
    cuenta: 'Tu cuenta',
  }

  async function registrar(e: React.FormEvent) {
    e.preventDefault()
    setErrorMsg('')
    if (password.length < 6) {
      setErrorMsg('La contraseña debe tener al menos 6 caracteres.')
      return
    }
    // El teléfono es obligatorio para cualquier rol: es cómo el equipo (o
    // quien reporta/atiende) puede contactar a la persona.
    if (!telefono.trim()) {
      setErrorMsg('El teléfono es obligatorio para crear tu cuenta.')
      return
    }
    if (!esTelefonoValido(telefono)) {
      setErrorMsg(mensajeTelefono())
      return
    }
    // Psicólogo/a exige un documento válido (cédula/pasaporte venezolano o
    // RUT/pasaporte chileno): es quien atendería casos sensibles de salud
    // mental, así que el equipo necesita verificar identidad real antes de
    // otorgar el rol.
    // Documento de TODOS: en Chile el RUT se comprueba con su dígito
    // verificador, así que un número inventado no pasa de aquí.
    const checkDoc = quierePsicologo
      ? validarDocumentoPsicologo(pais, tipoDoc, documento)
      : validarDocumentoPersona(pais, tipoDoc, documento)
    if (!checkDoc.valido) {
      setErrorMsg(checkDoc.mensaje)
      return
    }
    if (participa === 'entidad') {
      if (!categoria) {
        setErrorMsg('Elige qué tipo de entidad representas.')
        return
      }
      if (categoria === 'profesional' && !profesionFinal) {
        setErrorMsg(
          profesion === PROFESION_OTRA
            ? 'Escribe cuál es tu profesión.'
            : 'Elige tu profesión.',
        )
        return
      }
      if (!nombrePublicoEntidad) {
        setErrorMsg(
          categoria === 'profesional'
            ? 'Escribe tu nombre y apellido.'
            : 'Escribe el nombre oficial de la organización.',
        )
        return
      }
      if (pideFacturacion) {
        if (!razonSocial.trim()) {
          setErrorMsg(
            'Escribe la razón social (el nombre legal que va en la factura).',
          )
          return
        }
        const checkFiscal = validarIdFiscal(pais, idFiscal)
        if (!checkFiscal.valido) {
          setErrorMsg(checkFiscal.mensaje)
          return
        }
      }
    }
    setEnviando(true)
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
          data: {
            nombre: nombre.trim(),
            rol,
            pais,
            tipo_documento: tipoDoc,
            documento: documento.trim(),
            telefono: telefono.trim(),
            ciudad: ciudad.trim(),
            estado,
            // El servidor crea la solicitud de psicólogo/a automáticamente
            // (handle_new_user, migración 48) con estos mismos datos: el
            // rol NO se autoasigna, lo otorga el equipo tras revisarla.
            quiere_psicologo: quierePsicologo ? 'true' : 'false',
            // Igual para entidades (handle_new_user, migración 61). Va por
            // metadata y no por un insert desde aquí porque si el correo
            // exige confirmación todavía no hay sesión con la que insertar.
            ...(esEntidad && categoria
              ? {
                  entidad: {
                    nombre: nombrePublicoEntidad,
                    categoria,
                    profesion: profesionFinal,
                    descripcion: descripcionEntidad.trim(),
                    telefono: telefono.trim(),
                    email_contacto: email.trim(),
                    web: webEntidad.trim(),
                    razon_social: razonSocial.trim(),
                    id_fiscal: idFiscal.trim(),
                    direccion_fiscal: direccionFiscal.trim(),
                    contacto_facturacion: contactoFacturacion.trim(),
                  },
                }
              : {}),
          },
        },
      })
      if (error) {
        setErrorMsg(mensajeDeError(error))
        setEnviando(false)
        return
      }
      // Supabase a veces no da error pero indica que el correo YA existe
      // devolviendo un usuario sin identidades. En ese caso avisamos.
      if (data.user && (data.user.identities?.length ?? 0) === 0) {
        setErrorMsg(
          'Ya existe una cuenta con este correo. Inicia sesión con tu contraseña.',
        )
        setEnviando(false)
        return
      }
      // Con sesión entramos; si no (confirmación de correo activada), avisamos.
      if (data.session) {
        navigate('/', { replace: true })
      } else {
        setListo('confirmar')
      }
    } catch (err) {
      setErrorMsg(mensajeDeError(err))
    } finally {
      setEnviando(false)
    }
  }

  if (listo === 'confirmar') {
    return (
      <div className="relative min-h-full flex items-center justify-center overflow-hidden bg-tinta-900 p-5">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-1/2 h-[34rem] w-[34rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-bandera-azul/30 blur-3xl"
        />
        <div className="relative w-full max-w-sm animate-entrada rounded-3xl bg-white p-6 text-center shadow-alta">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-bandera-azul/10 text-bandera-azul">
            <MailCheck className="h-6 w-6" aria-hidden="true" />
          </span>
          <h1 className="mt-3 text-xl font-extrabold text-tinta-900">
            Revisa tu correo
          </h1>
          <p className="mt-1 text-sm text-tinta-600">
            Te enviamos un enlace a <b>{email}</b> para confirmar tu cuenta.
          </p>
          {quierePsicologo && (
            <p className="mt-3 rounded-xl border border-purple-100 bg-purple-50 p-3 text-xs text-purple-900">
              Tu solicitud para ser psicólogo/a ya quedó registrada. El equipo
              la revisará y te contactará por teléfono.
            </p>
          )}
          {esEntidad && (
            <p className="mt-3 rounded-xl border border-teal-100 bg-teal-50 p-3 text-xs text-teal-900">
              Tu solicitud de <b>{nombrePublicoEntidad}</b> ya quedó
              registrada. El equipo la verificará por el canal oficial de la
              organización y te contactará.
            </p>
          )}
          <Link to="/login" className="btn-azul w-full mt-5 py-3">
            Ir a iniciar sesión
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="relative min-h-full flex flex-col items-center justify-center overflow-hidden bg-tinta-900 px-4 py-4">
      {/* Halo detrás de la tarjeta: profundidad sin dibujar nada que
          distraiga. Decorativo, fuera del árbol de accesibilidad. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 h-[34rem] w-[34rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-bandera-azul/30 blur-3xl"
      />

      <form
        onSubmit={registrar}
        className="relative w-full max-w-sm rounded-3xl border border-white/10 bg-white p-4 shadow-alta"
      >
        {/* Progreso: una barra por paso. Deja ver cuánto falta, que es lo
            que hace tolerable un formulario largo partido en trozos. */}
        <div
          className="flex items-center gap-1 mb-2.5"
          role="progressbar"
          aria-valuenow={idx + 1}
          aria-valuemin={1}
          aria-valuemax={pasos.length}
          aria-label={`Paso ${idx + 1} de ${pasos.length}`}
        >
          {pasos.map((p, i) => (
            <span
              key={p}
              className={`h-1 flex-1 rounded-full transition-colors duration-300 ease-suave ${
                i <= idx ? 'bg-bandera-azul' : 'bg-tinta-100'
              }`}
            />
          ))}
        </div>

        <div className="flex items-baseline justify-between gap-3">
          <h1 className="text-xl font-extrabold tracking-tight text-tinta-900">
            {TITULOS[paso]}
          </h1>
          {paso === 'participar' && (
            <button
              type="button"
              onClick={() => setVerRoles(true)}
              className="shrink-0 text-xs font-semibold text-bandera-azul hover:underline"
            >
              ¿Cuál elijo?
            </button>
          )}
        </div>

        {/* key={paso}: al cambiar de paso React vuelve a montar el bloque y
            la animación de entrada se reproduce de nuevo. */}
        <div key={paso} className="animate-entrada mt-3 space-y-3">
          {/* ---------- 1. ¿Cómo quieres participar? ---------- */}
          {paso === 'participar' && (
            <div className="grid grid-cols-2 gap-2">
              {OPCIONES_PARTICIPAR.map((o) => (
                <button
                  type="button"
                  key={o.v}
                  onClick={() => setParticipa(o.v)}
                  aria-pressed={participa === o.v}
                  className={`card h-full min-h-[6.5rem] flex flex-col text-left p-3 transition-all duration-200 ease-suave ${
                    participa === o.v
                      ? o.v === 'entidad'
                        ? 'ring-2 ring-teal-500 bg-teal-50/60 shadow-media'
                        : 'ring-2 ring-bandera-azul bg-bandera-azul/[0.04] shadow-media'
                      : 'hover:border-tinta-200 hover:shadow-media hover:-translate-y-[1px]'
                  }`}
                >
                  <o.icono
                    className="h-4 w-4 shrink-0 text-tinta-500"
                    aria-hidden="true"
                  />
                  <div className="mt-1 text-sm font-bold leading-tight text-tinta-800">
                    {o.titulo}
                  </div>
                  <div className="mt-0.5 text-[11px] leading-snug text-tinta-500">
                    {o.descripcion}
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* ---------- 2. ¿Qué representas? ---------- */}
          {/* Ocho categorías tienen que caber sin desplazar hasta en pantallas
              de 640 px, así que las filas van muy justas: los ejemplos se
              mantienen (ayudan a reconocerse) pero en cuerpo pequeño y con
              interlineado cerrado. */}
          {paso === 'categoria' && (
            <div className="grid gap-0.5">
              {CATEGORIAS_ORDEN.map((c) => {
                const meta = CATEGORIA_META[c]
                const Icono = ICONO_CATEGORIA_ENTIDAD[c]
                const elegida = categoria === c
                return (
                  <button
                    type="button"
                    key={c}
                    onClick={() => setCategoria(c)}
                    aria-pressed={elegida}
                    className={`flex items-center gap-2 rounded-lg border-2 px-2 py-1.5 text-left transition-all duration-200 ease-suave ${
                      elegida
                        ? 'border-teal-600 bg-teal-50'
                        : 'border-tinta-100 hover:border-teal-200 hover:bg-teal-50/40'
                    }`}
                  >
                    <Icono
                      className="h-4 w-4 shrink-0 text-teal-700"
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12px] font-bold leading-tight text-tinta-800">
                        {meta.etiqueta}
                      </span>
                      <span className="block text-[10px] leading-tight text-tinta-500">
                        {meta.ejemplos}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          )}

          {/* ---------- 3. Organización o profesión ---------- */}
          {paso === 'organizacion' && categoria === 'profesional' && (
            <>
              <div className="flex flex-wrap gap-1.5">
                {PROFESIONES.map((p) => (
                  <button
                    type="button"
                    key={p}
                    onClick={() => setProfesion(p)}
                    aria-pressed={profesion === p}
                    className={`rounded-full border-2 px-3 py-2 text-xs font-bold transition-all duration-200 ease-suave ${
                      profesion === p
                        ? 'border-teal-600 bg-teal-600 text-white shadow-boton'
                        : 'border-tinta-200 bg-white text-tinta-600 hover:border-teal-300'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
              {profesion === PROFESION_OTRA && (
                <input
                  className="input animate-entrada-suave"
                  placeholder="¿Cuál es tu profesión?"
                  maxLength={60}
                  autoFocus
                  value={profesionOtra}
                  onChange={(e) => setProfesionOtra(e.target.value)}
                />
              )}
            </>
          )}

          {paso === 'organizacion' && categoria && categoria !== 'profesional' && (
            <>
              <label className="block">
                <span className="text-sm font-bold text-tinta-800">
                  Nombre oficial
                </span>
                <input
                  className="input mt-1"
                  placeholder="Ej: Cuerpo de Bomberos de Coquimbo"
                  maxLength={80}
                  value={nombreEntidad}
                  onChange={(e) => setNombreEntidad(e.target.value)}
                />
              </label>
              <label className="block">
                <span className="text-sm font-bold text-tinta-800">
                  ¿Qué hacen?{' '}
                  <span className="font-normal text-tinta-400">(opcional)</span>
                </span>
                <textarea
                  className="input mt-1 min-h-[60px]"
                  placeholder="En una línea, para que la gente sepa en qué pueden ayudar."
                  maxLength={300}
                  value={descripcionEntidad}
                  onChange={(e) => setDescripcionEntidad(e.target.value)}
                />
              </label>
              <label className="block">
                <span className="text-sm font-bold text-tinta-800">
                  Sitio web o red social{' '}
                  <span className="font-normal text-tinta-400">(opcional)</span>
                </span>
                <input
                  className="input mt-1"
                  placeholder="Ayuda a verificarlos más rápido"
                  maxLength={120}
                  value={webEntidad}
                  onChange={(e) => setWebEntidad(e.target.value)}
                />
              </label>
            </>
          )}

          {/* ---------- 4. Facturación (solo categorías que se cobran) ---------- */}
          {paso === 'facturacion' && (
            <>
              <label className="block">
                <span className="text-sm font-bold text-tinta-800">
                  Razón social
                </span>
                <input
                  className="input mt-1"
                  placeholder="El nombre legal, como aparece en el SII o el SENIAT"
                  maxLength={120}
                  value={razonSocial}
                  onChange={(e) => setRazonSocial(e.target.value)}
                />
              </label>
              <label className="block">
                <span className="text-sm font-bold text-tinta-800">
                  RUT de empresa o RIF
                </span>
                <input
                  className="input mt-1"
                  placeholder="Ej: 76.123.456-7 o J-12345678-9"
                  maxLength={40}
                  value={idFiscal}
                  onChange={(e) => setIdFiscal(e.target.value)}
                />
              </label>
              <label className="block">
                <span className="text-sm font-bold text-tinta-800">
                  Dirección{' '}
                  <span className="font-normal text-tinta-400">(opcional)</span>
                </span>
                <input
                  className="input mt-1"
                  maxLength={160}
                  value={direccionFiscal}
                  onChange={(e) => setDireccionFiscal(e.target.value)}
                />
              </label>
              <label className="block">
                <span className="text-sm font-bold text-tinta-800">
                  Correo para las facturas{' '}
                  <span className="font-normal text-tinta-400">(opcional)</span>
                </span>
                <input
                  className="input mt-1"
                  type="email"
                  placeholder="Si es distinto al de la cuenta"
                  maxLength={120}
                  value={contactoFacturacion}
                  onChange={(e) => setContactoFacturacion(e.target.value)}
                />
              </label>
            </>
          )}

          {/* ---------- 5. ¿Dónde estás? ---------- */}
          {paso === 'lugar' && (
            <>
              {detectando && (
                <p className="flex items-center gap-2 text-xs text-tinta-500">
                  <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-tinta-200 border-t-bandera-azul" />
                  Detectando dónde estás para completarlo por ti…
                </p>
              )}
              {!detectando && lugarDetectado && (
                <p className="animate-entrada-suave rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-bandera-azul">
                  <MapPin
                    className="mr-1 inline h-4 w-4 align-[-3px]"
                    aria-hidden="true"
                  />
                  Parece que estás en <b>{lugarDetectado}</b>. Ya lo
                  completamos; si no es correcto, cámbialo.
                </p>
              )}
              <SelectorBandera
                opciones={OPCIONES_PAIS}
                valor={pais}
                onChange={(v) => {
                  tocadoPorUsuario.current = true
                  setPais(v)
                  setEstado('') // la zona anterior ya no aplica
                }}
              />
              {zona.opciones.length > 0 ? (
                <select
                  className="input"
                  value={estado}
                  onChange={(e) => {
                    tocadoPorUsuario.current = true
                    setEstado(e.target.value)
                    setCiudad('') // la ciudad anterior ya no corresponde
                    setCiudadOtra(false)
                  }}
                >
                  <option value="">{zona.etiqueta}…</option>
                  {zona.opciones.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  className="input"
                  placeholder={zona.etiqueta}
                  value={estado}
                  onChange={(e) => {
                    tocadoPorUsuario.current = true
                    setEstado(e.target.value)
                    setCiudad('')
                    setCiudadOtra(false)
                  }}
                />
              )}
              {ciudadesSugeridas.length > 0 && !ciudadOtra ? (
                <select
                  className="input"
                  value={ciudad}
                  onChange={(e) => {
                    if (e.target.value === '__otra__') {
                      setCiudadOtra(true)
                      setCiudad('')
                    } else {
                      setCiudad(e.target.value)
                    }
                  }}
                >
                  <option value="">Ciudad…</option>
                  {ciudadesSugeridas.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                  <option value="__otra__">Otra ciudad…</option>
                </select>
              ) : (
                <input
                  className="input"
                  placeholder="Ciudad"
                  value={ciudad}
                  onChange={(e) => setCiudad(e.target.value)}
                />
              )}
            </>
          )}

          {/* ---------- 6. ¿Quién eres? ---------- */}
          {paso === 'identidad' && (
            <>
              <input
                className="input"
                placeholder="Nombre y apellido"
                autoComplete="name"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
              />
              <div className="flex gap-2">
                {(['cedula', 'pasaporte'] as TipoDocumento[]).map((t) => (
                  <button
                    type="button"
                    key={t}
                    onClick={() => setTipoDoc(t)}
                    aria-pressed={tipoDoc === t}
                    className={`flex-1 rounded-xl border-2 py-2 text-sm font-semibold transition-colors duration-200 ${
                      tipoDoc === t
                        ? 'border-bandera-azul text-bandera-azul'
                        : 'border-tinta-200 text-tinta-500 hover:border-tinta-300'
                    }`}
                  >
                    {t === 'cedula'
                      ? pais === 'Chile'
                        ? 'RUT'
                        : 'Cédula'
                      : 'Pasaporte'}
                  </button>
                ))}
              </div>
              <input
                className="input"
                placeholder={
                  tipoDoc === 'cedula'
                    ? pais === 'Chile'
                      ? 'Ej: 12.345.678-5'
                      : 'Ej: V-12345678'
                    : 'N.º de pasaporte'
                }
                value={documento}
                onChange={(e) => setDocumento(e.target.value)}
              />
              {quierePsicologo && (
                <p className="text-[11px] leading-snug text-tinta-500">
                  Para tu solicitud de psicólogo/a se valida: cédula o
                  pasaporte venezolano, o RUT o pasaporte chileno.
                </p>
              )}
            </>
          )}

          {/* ---------- 7. Tu cuenta ---------- */}
          {paso === 'cuenta' && (
            <>
              <div>
                <p className="text-sm font-bold text-tinta-800 mb-1">
                  Teléfono{' '}
                  <span className="font-normal text-tinta-400">
                    {esEntidad || quierePsicologo
                      ? '· para verificarte'
                      : '· para contactarte'}
                  </span>
                </p>
                <EntradaTelefono
                  valor={telefono}
                  onChange={setTelefono}
                  requerido
                />
              </div>
              <input
                type="email"
                className="input"
                placeholder="Correo electrónico"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <div className="relative">
                <input
                  type={verPass ? 'text' : 'password'}
                  className="input pr-12"
                  placeholder="Contraseña (mínimo 6 caracteres)"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setVerPass((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-tinta-400 hover:text-tinta-600"
                  aria-label={verPass ? 'Ocultar contraseña' : 'Ver contraseña'}
                >
                  {verPass ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>
              </div>
              {esEntidad && (
                <p className="rounded-xl border border-teal-100 bg-teal-50/70 px-2.5 py-2 text-[11px] leading-snug text-teal-900">
                  <strong>Verificamos antes de publicar.</strong> La insignia
                  aparece cuando confirmemos la organización por su canal
                  oficial.
                </p>
              )}
            </>
          )}
        </div>

        {errorMsg && (
          <p className="animate-entrada-suave mt-3 flex items-center gap-1.5 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-bandera-rojo">
            <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
            {errorMsg}
          </p>
        )}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => (idx === 0 ? navigate('/') : setPasoIdx(idx - 1))}
            className="btn-gris flex-1 py-3"
          >
            ← Atrás
          </button>
          {esUltimo ? (
            <button
              type="submit"
              disabled={enviando || !pasoCompleto}
              className="btn-verde flex-1 py-3 disabled:opacity-60"
            >
              {enviando ? (
                'Creando…'
              ) : (
                <>
                  <UserRoundPlus className="h-5 w-5" aria-hidden="true" />
                  Crear cuenta
                </>
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setPasoIdx(idx + 1)}
              disabled={!pasoCompleto}
              className="btn-azul flex-1 py-3 disabled:opacity-60"
            >
              Siguiente →
            </button>
          )}
        </div>
      </form>

      <p className="relative mt-3 text-center text-xs text-white/70">
        ¿Ya tienes cuenta?{' '}
        <Link
          to="/login"
          className="font-bold text-white no-underline hover:underline"
        >
          Iniciar sesión
        </Link>
      </p>

      {verRoles && <RolesInfoModal onCerrar={() => setVerRoles(false)} />}
    </div>
  )
}
