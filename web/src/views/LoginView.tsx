import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Eye, EyeOff, LogIn, TriangleAlert } from 'lucide-react'
import { supabase } from '../lib/supabase'
import Paloma from '../components/Paloma'
import { ROL_META, type RolRegistro } from '../lib/types'

const ROLES_VALIDOS: RolRegistro[] = [
  'ciudadano',
  'voluntario',
  'rescatista',
  'centro_acopio',
]

/**
 * Inicio de sesión.
 *
 * Fondo oscuro con la tarjeta blanca flotando: da el aire cuidado que se
 * buscaba sin sacrificar legibilidad (el formulario sigue siendo oscuro
 * sobre blanco, que es lo que se lee bien con poca luz o poca vista).
 *
 * Entra COMPLETO en pantalla, sin desplazar: es lo primero que ve alguien
 * en una emergencia. Por eso "crear cuenta" bajó de botón grande a enlace
 * —en esta pantalla la acción principal es entrar, no registrarse— y se
 * quitó el texto de relleno que explicaba para quién era.
 */
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
    <div className="relative min-h-full flex flex-col items-center justify-center overflow-hidden bg-tinta-900 px-5 py-6">
      {/* Halo suave detrás de la tarjeta: da profundidad sin dibujar nada
          que distraiga. Decorativo, fuera del árbol de accesibilidad. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 h-[34rem] w-[34rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-bandera-azul/30 blur-3xl"
      />

      {/* La marca NO se repite aquí: la barra superior ya la muestra, y
          verla dos veces a diez centímetros se lee como un descuido. */}
      <div className="relative w-full max-w-sm rounded-3xl border border-white/10 bg-white p-6 shadow-alta">
        <Paloma className="h-8 w-8 text-bandera-azul" />
        <h1 className="mt-3 text-2xl font-extrabold text-tinta-900 tracking-tight">
          Iniciar sesión
        </h1>
        {rol && (
          <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-bandera-azul/10 px-2.5 py-1 text-xs font-bold text-bandera-azul">
            Entrarás como {ROL_META[rol].etiqueta}
          </span>
        )}

        <form onSubmit={ingresar} className="mt-5 space-y-3">
          <input
            type="email"
            required
            autoComplete="email"
            className="input"
            placeholder="tucorreo@ejemplo.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <div className="relative">
            <input
              type={verPass ? 'text' : 'password'}
              required
              autoComplete="current-password"
              className="input pr-12"
              placeholder="Contraseña"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setVerPass((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-tinta-400 hover:text-tinta-600"
              aria-label={verPass ? 'Ocultar contraseña' : 'Ver contraseña'}
              title={verPass ? 'Ocultar contraseña' : 'Ver contraseña'}
            >
              {verPass ? (
                <EyeOff className="h-5 w-5" />
              ) : (
                <Eye className="h-5 w-5" />
              )}
            </button>
          </div>

          {errorMsg && (
            <p className="flex items-center gap-1.5 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-bandera-rojo">
              <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
              {errorMsg}
            </p>
          )}

          <button
            type="submit"
            disabled={cargando}
            className="btn-azul w-full py-3.5 text-lg disabled:opacity-60"
          >
            {cargando ? (
              'Entrando…'
            ) : (
              <>
                <LogIn className="h-5 w-5" />
                Entrar
              </>
            )}
          </button>
        </form>

        <Link
          to="/recuperar"
          className="mt-3 block text-center text-sm font-semibold text-tinta-500 no-underline hover:text-bandera-azul"
        >
          ¿Olvidaste tu contraseña?
        </Link>
      </div>

      <p className="relative mt-5 text-center text-sm text-white/70">
        ¿No tienes cuenta?{' '}
        <Link
          to={rol ? `/registro?rol=${rol}` : '/registro'}
          className="font-bold text-white no-underline hover:underline"
        >
          Crear cuenta
        </Link>
      </p>

      <Link
        to="/"
        className="relative mt-2 text-sm font-semibold text-white/50 no-underline hover:text-white/80"
      >
        ← Volver al mapa
      </Link>
    </div>
  )
}
