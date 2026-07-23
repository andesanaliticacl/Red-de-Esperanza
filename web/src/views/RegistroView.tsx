import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import EntradaTelefono, {
  esTelefonoVenezuelaValido,
  mensajeTelefonoVenezuela,
} from '../components/EntradaTelefono'
import RolesInfoModal from '../components/RolesInfoModal'
import SelectorBandera from '../components/SelectorBandera'
import { PAISES_MUNDO } from '../lib/paises'
import { zonasDePais, ciudadesDeZona } from '../lib/zonas'
import { validarDocumentoPsicologo } from '../lib/documentos'
import { type RolRegistro, type TipoDocumento } from '../lib/types'

const OPCIONES_PAIS = PAISES_MUNDO.map((p) => ({
  value: p.nombre,
  iso: p.iso,
  etiqueta: p.nombre,
}))

// "¿Cómo quieres participar?": solo 4 tarjetas, en lenguaje natural (no
// técnico). "Ciudadano" ya no es una opción de registro: quien solo quiere
// ver el mapa no necesita cuenta. "Psicólogo/a" NO asigna el rol directo:
// crea la cuenta como colaborador/a y deja pendiente una solicitud que
// revisa el equipo (ver quiere_psicologo más abajo).
type OpcionParticipar = 'voluntario' | 'rescatista' | 'centro_acopio' | 'psicologo'
const OPCIONES_PARTICIPAR: {
  v: OpcionParticipar
  emoji: string
  titulo: string
  descripcion: string
}[] = [
  {
    v: 'voluntario',
    emoji: '❤️',
    titulo: 'Ayudar',
    descripcion: 'Apoyo a atender y coordinar reportes.',
  },
  {
    v: 'rescatista',
    emoji: '🚑',
    titulo: 'Soy rescatista',
    descripcion: 'Atiendo rescates y emergencias en terreno.',
  },
  {
    v: 'centro_acopio',
    emoji: '📦',
    titulo: 'Represento un centro de acopio',
    descripcion: 'Gestiono donaciones y suministros.',
  },
  {
    v: 'psicologo',
    emoji: '🧠',
    titulo: 'Soy psicólogo/a y deseo colaborar',
    descripcion: 'El equipo revisa tu solicitud antes de otorgar el rol.',
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
// incluye 'ciudadano' (ya no es una tarjeta de registro) ni 'psicologo'
// (ese viene por separado con "?psicologo=1").
const ROLES_VALIDOS: Exclude<OpcionParticipar, 'psicologo'>[] = [
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
      ? 'psicologo'
      : ROLES_VALIDOS.includes(rolInicial as (typeof ROLES_VALIDOS)[number])
        ? (rolInicial as (typeof ROLES_VALIDOS)[number])
        : 'voluntario',
  )
  // "Psicólogo/a" NO es el rol de la cuenta: se crea como voluntario/a y
  // queda un pedido aparte que revisa el equipo de psicología.
  const quierePsicologo = participa === 'psicologo'
  const rol: Exclude<RolRegistro, 'psicologo'> =
    participa === 'psicologo' ? 'voluntario' : participa
  const [pais, setPais] = useState('Venezuela')
  const [tipoDoc, setTipoDoc] = useState<TipoDocumento>('cedula')
  const [documento, setDocumento] = useState('')
  const [telefono, setTelefono] = useState('')
  const [estado, setEstado] = useState('')
  const [ciudad, setCiudad] = useState('')
  // Cuando la ciudad no está en la lista sugerida, se escribe a mano.
  const [ciudadOtra, setCiudadOtra] = useState(false)

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
    if (!esTelefonoVenezuelaValido(telefono)) {
      setErrorMsg(mensajeTelefonoVenezuela())
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
              🧠 Tu solicitud para ser psicólogo/a ya quedó registrada. El
              equipo de psicología la revisará y te contactará por teléfono.
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
          {/* País donde estás */}
          <div>
            <p className="font-bold text-sm mb-2">¿En qué país estás?</p>
            <SelectorBandera
              opciones={OPCIONES_PAIS}
              valor={pais}
              onChange={(v) => {
                setPais(v)
                // Al cambiar de país, la zona anterior ya no aplica.
                setEstado('')
              }}
            />
          </div>

          {/* ¿Cómo quieres participar? Una sola elección entre 4 tarjetas. */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="font-bold text-sm">¿Cómo quieres participar?</p>
              <button
                type="button"
                onClick={() => setVerRoles(true)}
                className="text-xs text-bandera-azul font-semibold underline"
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
                  className={`card text-left p-3 border-2 ${
                    participa === o.v
                      ? o.v === 'psicologo'
                        ? 'border-purple-400 bg-purple-50'
                        : 'border-bandera-azul'
                      : 'border-transparent'
                  }`}
                >
                  <div className="font-bold text-sm">
                    {o.emoji} {o.titulo}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {o.descripcion}
                  </div>
                </button>
              ))}
            </div>
            {quierePsicologo && (
              <p className="text-xs text-purple-900 bg-purple-50 border border-purple-100 rounded-xl p-3 mt-2">
                🧠 Tu cuenta se crea como colaborador/a. El equipo de
                psicología revisará tu solicitud, te contactará por teléfono
                y, si corresponde, te otorgará el rol.
              </p>
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
              {verPass ? '🙈' : '👁️'}
            </button>
          </div>

          {errorMsg && (
            <p className="text-bandera-rojo text-sm font-medium">⚠️ {errorMsg}</p>
          )}

          <button
            type="submit"
            disabled={enviando}
            className="btn-verde w-full text-xl py-4 disabled:opacity-60"
          >
            {enviando ? 'Creando cuenta…' : '✨ Crear cuenta'}
          </button>
        </form>

        <div className="mt-6 pt-5 border-t text-center">
          <p className="text-gray-600 mb-3">¿Ya tienes cuenta?</p>
          <Link
            to="/login"
            className="btn-azul w-full text-xl py-4 no-underline"
          >
            ➡️ Iniciar sesión
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
