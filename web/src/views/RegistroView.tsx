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
  LogIn,
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
import { validarDocumentoPsicologo } from '../lib/documentos'
import { type RolRegistro, type TipoDocumento } from '../lib/types'
import {
  CATEGORIA_META,
  CATEGORIAS_ORDEN,
  PROFESIONES,
  PROFESION_PSICOLOGO,
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
  const [nombreEntidad, setNombreEntidad] = useState('')
  const [descripcionEntidad, setDescripcionEntidad] = useState('')
  const [webEntidad, setWebEntidad] = useState('')

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
    if (quierePsicologo) {
      const check = validarDocumentoPsicologo(pais, tipoDoc, documento)
      if (!check.valido) {
        setErrorMsg(check.mensaje)
        return
      }
    }
    if (participa === 'entidad') {
      if (!categoria) {
        setErrorMsg('Elige qué tipo de entidad representas.')
        return
      }
      if (categoria === 'profesional' && !profesion) {
        setErrorMsg('Elige tu profesión.')
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
                    profesion: profesion || '',
                    descripcion: descripcionEntidad.trim(),
                    telefono: telefono.trim(),
                    email_contacto: email.trim(),
                    web: webEntidad.trim(),
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
      <div className="min-h-full flex items-center justify-center p-6 bg-gray-50">
        <div className="card w-full max-w-md text-center">
          <div className="text-4xl mb-3">📩</div>
          <h1 className="text-xl font-extrabold text-bandera-azul mb-2">
            Revisa tu correo
          </h1>
          <p className="text-gray-600">
            Te enviamos un enlace a <b>{email}</b> para confirmar tu cuenta.
            Ábrelo y luego inicia sesión.
          </p>
          {quierePsicologo && (
            <p className="text-sm text-purple-900 bg-purple-50 border border-purple-100 rounded-xl p-3 mt-3">
              Tu solicitud para ser psicólogo/a ya quedó registrada. El
              equipo de psicología la revisará y te contactará por teléfono.
            </p>
          )}
          {esEntidad && (
            <p className="text-sm text-teal-900 bg-teal-50 border border-teal-100 rounded-xl p-3 mt-3">
              Tu solicitud de <b>{nombrePublicoEntidad}</b> ya quedó
              registrada. El equipo la verificará por el canal oficial de la
              organización y te contactará.
            </p>
          )}
          <Link to="/login" className="btn-azul w-full mt-5">
            Ir a iniciar sesión
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-full flex flex-col items-center justify-center p-4 bg-gray-50">
      <div className="card w-full max-w-md">
        <h1 className="text-2xl font-extrabold text-bandera-azul mb-1">
          Crear cuenta
        </h1>
        <p className="text-gray-600 mb-5 text-sm">
          Elige cómo quieres participar en la red.
        </p>

        <form onSubmit={registrar} className="space-y-4">
          {/* Ubicación detectada: se rellena sola, pero todo es editable. */}
          {detectando && (
            <p className="text-sm text-gray-500 flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded-full border-2 border-gray-300 border-t-bandera-azul animate-spin" />
              Detectando dónde estás para completarlo por ti…
            </p>
          )}
          {!detectando && lugarDetectado && (
            <p className="text-sm rounded-xl bg-blue-50 border border-blue-100 px-3 py-2 text-bandera-azul">
              <MapPin className="mr-1 inline h-4 w-4 align-[-3px]" aria-hidden="true" />Parece que estás en <b>{lugarDetectado}</b>. Ya lo completamos;
              si no es correcto, cámbialo abajo.
            </p>
          )}

          {/* País donde estás */}
          <div>
            <p className="font-bold text-sm mb-2">¿En qué país estás?</p>
            <SelectorBandera
              opciones={OPCIONES_PAIS}
              valor={pais}
              onChange={(v) => {
                tocadoPorUsuario.current = true
                setPais(v)
                // Al cambiar de país, la zona anterior ya no aplica.
                setEstado('')
              }}
            />
          </div>

          {/* ¿Cómo quieres participar? Una sola elección entre 4 tarjetas. */}
          <div>
            <div className="flex items-baseline justify-between gap-3 mb-2">
              <p className="font-bold text-sm text-tinta-800">
                ¿Cómo quieres participar?
              </p>
              <button
                type="button"
                onClick={() => setVerRoles(true)}
                className="shrink-0 text-xs text-bandera-azul font-semibold hover:underline"
              >
                ¿Qué significa cada uno?
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {OPCIONES_PARTICIPAR.map((o) => (
                <button
                  type="button"
                  key={o.v}
                  onClick={() => setParticipa(o.v)}
                  aria-pressed={participa === o.v}
                  // h-full: las cuatro quedan de la misma altura aunque los
                  // textos midan distinto. El estado elegido se marca con un
                  // anillo (no con el borde) para que nada se desplace.
                  className={`card h-full min-h-[7rem] flex flex-col text-left p-3.5 transition-all duration-200 ease-suave ${
                    participa === o.v
                      ? o.v === 'entidad'
                        ? 'ring-2 ring-teal-500 bg-teal-50/60 shadow-media'
                        : 'ring-2 ring-bandera-azul bg-bandera-azul/[0.04] shadow-media'
                      : 'hover:border-tinta-200 hover:shadow-media'
                  }`}
                >
                  <div className="font-bold text-sm text-tinta-800">
                    <o.icono className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {o.titulo}
                  </div>
                  <div className="text-xs text-tinta-500 mt-1 leading-snug">
                    {o.descripcion}
                  </div>
                </button>
              ))}
            </div>
            {/* Segundo paso: qué tipo de entidad. Solo aparece al elegir la
                tarjeta, para no cargar la pantalla a quien no la necesita. */}
            {participa === 'entidad' && (
              <div className="mt-3 rounded-2xl border border-teal-100 bg-teal-50/40 p-3.5 space-y-3">
                <p className="font-bold text-sm text-tinta-800">
                  ¿Qué representas?
                </p>
                <div className="grid gap-2">
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
                        className={`flex items-center gap-3 rounded-xl border-2 bg-white p-2.5 text-left transition-colors ${
                          elegida
                            ? 'border-teal-600 bg-teal-50'
                            : 'border-transparent hover:border-teal-200'
                        }`}
                      >
                        <Icono
                          className="h-5 w-5 shrink-0 text-teal-700"
                          aria-hidden="true"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-bold text-tinta-800 leading-tight">
                            {meta.etiqueta}
                          </span>
                          <span className="block text-xs text-tinta-500 leading-snug">
                            {meta.ejemplos}
                          </span>
                        </span>
                      </button>
                    )
                  })}
                </div>

                {/* Persona: profesión de una lista corta. */}
                {categoria === 'profesional' && (
                  <div>
                    <p className="font-bold text-sm text-tinta-800 mb-1.5">
                      ¿Cuál es tu profesión?
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {PROFESIONES.map((p) => (
                        <button
                          type="button"
                          key={p}
                          onClick={() => setProfesion(p)}
                          aria-pressed={profesion === p}
                          className={`rounded-full border-2 px-3 py-1.5 text-xs font-bold transition-colors ${
                            profesion === p
                              ? 'border-teal-600 bg-teal-600 text-white'
                              : 'border-tinta-200 bg-white text-tinta-600 hover:border-teal-300'
                          }`}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Organización: nombre público + qué hacen. */}
                {categoria && categoria !== 'profesional' && (
                  <div className="space-y-2">
                    <label className="block">
                      <span className="font-bold text-sm text-tinta-800">
                        Nombre oficial de la organización
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
                      <span className="font-bold text-sm text-tinta-800">
                        ¿Qué hacen? <span className="font-normal text-tinta-400">(opcional)</span>
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
                      <span className="font-bold text-sm text-tinta-800">
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
                  </div>
                )}

                {/* Qué va a pasar después: el proceso ES la garantía. */}
                {categoria && (
                  <p className="text-xs leading-relaxed text-teal-900 bg-white border border-teal-100 rounded-xl p-3">
                    {esPsicologo ? (
                      <>
                        Tu cuenta se crea como colaborador/a. El equipo de
                        psicología revisará tu solicitud, te contactará por
                        teléfono y, si corresponde, te otorgará el rol.
                      </>
                    ) : (
                      <>
                        <strong>Verificamos antes de publicar.</strong> Tu
                        cuenta se crea de inmediato, pero la insignia y el
                        perfil público aparecen recién cuando confirmemos la
                        organización por su canal oficial. Es lo que hace que
                        la gente pueda confiar en lo que publiques.
                      </>
                    )}
                  </p>
                )}
              </div>
            )}
          </div>

          <input
            className="input"
            placeholder="Nombre y apellido"
            required
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
          />

          {/* Documento */}
          <div>
            <div className="flex gap-2 mb-2">
              {(['cedula', 'pasaporte'] as TipoDocumento[]).map((t) => (
                <button
                  type="button"
                  key={t}
                  onClick={() => setTipoDoc(t)}
                  className={`flex-1 rounded-xl py-2 text-sm font-semibold border-2 ${
                    tipoDoc === t
                      ? 'border-bandera-azul text-bandera-azul'
                      : 'border-gray-200 text-gray-500'
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
              required
              value={documento}
              onChange={(e) => setDocumento(e.target.value)}
            />
            {quierePsicologo && (
              <p className="text-xs text-gray-500 mt-1">
                Para tu solicitud de psicólogo/a, el documento se valida:
                cédula/pasaporte venezolano o RUT/pasaporte chileno.
              </p>
            )}
          </div>

          {/* Zona (se adapta al país: Estado / Región / Provincia…) + ciudad */}
          <div className="grid grid-cols-2 gap-2">
            {zona.opciones.length > 0 ? (
              <select
                className="input"
                required
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
                required
                value={estado}
                onChange={(e) => {
                  tocadoPorUsuario.current = true
                  setEstado(e.target.value)
                  setCiudad('')
                  setCiudadOtra(false)
                }}
              />
            )}

            {/* Ciudad: menú desplegable si tenemos lista; "Otra…" deja escribir. */}
            {ciudadesSugeridas.length > 0 && !ciudadOtra ? (
              <select
                className="input"
                required
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
                <option value="__otra__">✏️ Otra ciudad…</option>
              </select>
            ) : (
              <input
                className="input"
                placeholder="Ciudad"
                required
                value={ciudad}
                onChange={(e) => setCiudad(e.target.value)}
              />
            )}
          </div>

          <div>
            <p className="text-sm font-semibold mb-1">
              Teléfono <span className="text-bandera-rojo">*</span>
            </p>
            <p className="text-xs text-gray-500 mb-1">
              {quierePsicologo
                ? 'Es cómo el equipo de psicología te contactará para revisar tu solicitud.'
                : esEntidad
                  ? 'Es cómo el equipo te contactará para verificar la organización.'
                  : 'Es cómo otras personas de la red pueden contactarte si haces falta.'}
            </p>
            <EntradaTelefono valor={telefono} onChange={setTelefono} requerido />
          </div>

          <hr className="border-gray-100" />

          <input
            type="email"
            className="input"
            placeholder="Correo electrónico"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <div className="relative">
            <input
              type={verPass ? 'text' : 'password'}
              className="input pr-12"
              placeholder="Contraseña (mínimo 6 caracteres)"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setVerPass((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-lg"
              aria-label={verPass ? 'Ocultar contraseña' : 'Ver contraseña'}
              title={verPass ? 'Ocultar contraseña' : 'Ver contraseña'}
            >
              {verPass ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
          </div>

          {errorMsg && (
            <p className="flex items-center gap-1.5 text-bandera-rojo text-sm font-medium"><TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />{errorMsg}</p>
          )}

          <button
            type="submit"
            disabled={enviando}
            className="btn-verde w-full text-xl py-4 disabled:opacity-60"
          >
            {enviando ? ('Creando cuenta…') : (<><UserRoundPlus className="h-5 w-5" aria-hidden="true" />Crear cuenta</>)}
          </button>
        </form>

        <div className="mt-6 pt-5 border-t text-center">
          <p className="text-gray-600 mb-3">¿Ya tienes cuenta?</p>
          <Link
            to="/login"
            className="btn-azul w-full text-xl py-4 no-underline"
          >
            <LogIn className="h-5 w-5" aria-hidden="true" />Iniciar sesión
          </Link>
        </div>
        <Link
          to="/"
          className="block text-center mt-2 text-bandera-azul font-semibold text-sm"
        >
          ← Volver al mapa
        </Link>
      </div>
      {verRoles && <RolesInfoModal onCerrar={() => setVerRoles(false)} />}
    </div>
  )
}
