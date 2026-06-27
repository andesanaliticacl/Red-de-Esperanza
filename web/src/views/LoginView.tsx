import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { ROL_META, type RolRegistro } from '../lib/types'

const ROLES_VALIDOS: RolRegistro[] = [
  'ciudadano',
  'voluntario',
  'rescatista',
  'centro_acopio',
]

export default function LoginView() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const rolParam = searchParams.get('rol')
  // Rol elegido en el acceso directo del inicio (si vino uno válido).
  const rol = ROLES_VALIDOS.includes(rolParam as RolRegistro)
    ? (rolParam as RolRegistro)
    : null
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [verPass, setVerPass] = useState(false)
  const [cargando, setCargando] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  async function ingresar(e: React.FormEvent) {
    e.preventDefault()
    setErrorMsg('')
    setCargando(true)
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    setCargando(false)
    if (error) {
      setErrorMsg(
        error.message.includes('Invalid')
          ? 'Correo o contraseña incorrectos.'
          : error.message,
      )
    } else {
      navigate('/', { replace: true })
    }
  }

  return (
    <div className="min-h-full flex flex-col items-center justify-center p-6 bg-gray-50">
      <div className="card w-full max-w-md">
        <h1 className="text-2xl font-extrabold text-bandera-azul mb-1">
          {rol ? `Iniciar sesión como ${ROL_META[rol].etiqueta}` : 'Iniciar sesión'}
        </h1>
        {rol ? (
          <p className="text-gray-600 mb-5 text-sm">
            {ROL_META[rol].emoji} Entra con tu correo y contraseña. ¿Aún no tienes
            cuenta? Créala abajo y quedará lista como{' '}
            <b>{ROL_META[rol].etiqueta}</b>.
          </p>
        ) : (
          <p className="text-gray-600 mb-5 text-sm">
            Para ciudadanos registrados, voluntarios, rescatistas y equipo.
          </p>
        )}

        <form onSubmit={ingresar} className="space-y-4">
            <input
              type="email"
              required
              className="input"
              placeholder="tucorreo@ejemplo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <div className="relative">
              <input
                type={verPass ? 'text' : 'password'}
                required
                className="input pr-12"
                placeholder="Contraseña"
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
            {errorMsg && <p className="text-bandera-rojo text-sm">⚠️ {errorMsg}</p>}
            <button
              type="submit"
              disabled={cargando}
              className="btn-azul w-full text-xl py-4 disabled:opacity-60"
            >
              {cargando ? 'Entrando…' : '➡️ Entrar'}
            </button>
          </form>

        <div className="mt-6 pt-5 border-t text-center">
          <p className="text-gray-600 mb-3">¿No tienes cuenta todavía?</p>
          <Link
            to={rol ? `/registro?rol=${rol}` : '/registro'}
            className="btn-verde w-full text-xl py-4 no-underline"
          >
            ✨ Crear cuenta{rol ? ` como ${ROL_META[rol].etiqueta}` : ''}
          </Link>
        </div>
        <Link
          to="/"
          className="block text-center mt-4 text-bandera-azul font-semibold text-sm"
        >
          ← Volver al mapa
        </Link>
      </div>
    </div>
  )
}
