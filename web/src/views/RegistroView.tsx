import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import EntradaTelefono from '../components/EntradaTelefono'
import RolesInfoModal from '../components/RolesInfoModal'
import SelectorBandera from '../components/SelectorBandera'
import { PAISES_MUNDO } from '../lib/paises'
import { zonasDePais, ciudadesDeZona } from '../lib/zonas'
import {
  ROL_META,
  type RolRegistro,
  type TipoDocumento,
} from '../lib/types'

const OPCIONES_PAIS = PAISES_MUNDO.map((p) => ({
  value: p.nombre,
  iso: p.iso,
  etiqueta: p.nombre,
}))

const DESCRIPCION_ROL: Record<RolRegistro, string> = {
  ciudadano: 'Reporto necesidades y sigo el mapa.',
  voluntario: 'Ayudo a atender y coordinar reportes.',
  rescatista: 'Atiendo rescates y emergencias en terreno.',
  centro_acopio: 'Gestiono donaciones y suministros.',
}

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

export default function RegistroView() {
  const navigate = useNavigate()
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rol, setRol] = useState<RolRegistro>('ciudadano')
  const [pais, setPais] = useState('Venezuela')
  const [tipoDoc, setTipoDoc] = useState<TipoDocumento>('cedula')
  const [documento, setDocumento] = useState('')
  const [telefono, setTelefono] = useState('')
  const [estado, setEstado] = useState('')
  const [ciudad, setCiudad] = useState('')

  // Divisiones del país elegido (Estado/Región/Provincia… con sus nombres).
  const isoPais = PAISES_MUNDO.find((p) => p.nombre === pais)?.iso
  const zona = zonasDePais(isoPais)
  // Ciudades sugeridas según la zona elegida (autocompletar, no obligatorio).
  const ciudadesSugeridas = ciudadesDeZona(isoPais, estado)

  // Voluntario/rescatista solo para quienes están en Venezuela.
  const enVenezuela = pais === 'Venezuela'
  const rolesDisponibles: RolRegistro[] = enVenezuela
    ? ['ciudadano', 'voluntario', 'rescatista', 'centro_acopio']
    : ['ciudadano', 'centro_acopio']

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
          },
        },
      })
      if (error) {
        setErrorMsg(mensajeDeError(error))
        setEnviando(false)
        return
      }
      // Si el proyecto exige confirmación por correo no habrá sesión todavía.
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
          Para participar como ciudadano, voluntario, rescatista o centro de
          acopio.
        </p>

        <form onSubmit={registrar} className="space-y-4">
          {/* País donde estás (define qué roles puedes elegir) */}
          <div>
            <p className="font-bold text-sm mb-2">¿En qué país estás?</p>
            <SelectorBandera
              opciones={OPCIONES_PAIS}
              valor={pais}
              onChange={(v) => {
                setPais(v)
                // Al cambiar de país, la zona anterior ya no aplica.
                setEstado('')
                // Voluntario/rescatista solo en Venezuela: si cambia, reseteamos.
                if (v !== 'Venezuela' && (rol === 'voluntario' || rol === 'rescatista'))
                  setRol('ciudadano')
              }}
            />
            {!enVenezuela && (
              <p className="text-xs text-gray-500 mt-1">
                Fuera de Venezuela puedes participar como ciudadano o centro de
                acopio.
              </p>
            )}
          </div>

          {/* Rol */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="font-bold text-sm">¿Cómo participas?</p>
              <button
                type="button"
                onClick={() => setVerRoles(true)}
                className="text-xs text-bandera-azul font-semibold underline"
              >
                ¿Qué rol elegir?
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {rolesDisponibles.map((r) => (
                <button
                  type="button"
                  key={r}
                  onClick={() => setRol(r)}
                  className={`card text-left p-3 border-2 ${
                    rol === r ? 'border-bandera-azul' : 'border-transparent'
                  }`}
                >
                  <div className="font-bold text-sm">
                    {ROL_META[r].emoji} {ROL_META[r].etiqueta}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {DESCRIPCION_ROL[r]}
                  </div>
                </button>
              ))}
            </div>
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
                  {t === 'cedula' ? 'Cédula' : 'Pasaporte'}
                </button>
              ))}
            </div>
            <input
              className="input"
              placeholder={
                tipoDoc === 'cedula' ? 'Ej: V-12345678' : 'N.º de pasaporte'
              }
              required
              value={documento}
              onChange={(e) => setDocumento(e.target.value)}
            />
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
                }}
              />
            )}
            <input
              className="input"
              placeholder="Ciudad"
              required
              list="lista-ciudades"
              value={ciudad}
              onChange={(e) => setCiudad(e.target.value)}
            />
            <datalist id="lista-ciudades">
              {ciudadesSugeridas.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>

          <div>
            <p className="text-sm font-semibold mb-1">Teléfono (opcional)</p>
            <EntradaTelefono valor={telefono} onChange={setTelefono} />
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
