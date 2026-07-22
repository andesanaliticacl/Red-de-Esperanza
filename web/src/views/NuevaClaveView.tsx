import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

/**
 * Paso 2 de "olvidé mi contraseña": la persona llegó desde el enlace del
 * correo. Supabase ya estableció una sesión de recuperación
 * (detectSessionInUrl). Aquí pone su clave nueva con updateUser.
 */
export default function NuevaClaveView() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [verPass, setVerPass] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [listo, setListo] = useState(false)
  // ¿Hay una sesión de recuperación válida? (el enlace la crea).
  const [sesionOk, setSesionOk] = useState<boolean | null>(null)

  useEffect(() => {
    // Damos un momento a que detectSessionInUrl procese el token del enlace.
    const t = window.setTimeout(async () => {
      const { data } = await supabase.auth.getSession()
      setSesionOk(Boolean(data.session))
    }, 600)
    return () => window.clearTimeout(t)
  }, [])

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    setErrorMsg('')
    if (password.length < 6) {
      setErrorMsg('La contraseña debe tener al menos 6 caracteres.')
      return
    }
    setGuardando(true)
    const { error } = await supabase.auth.updateUser({ password })
    setGuardando(false)
    if (error) {
      setErrorMsg(error.message)
      return
    }
    setListo(true)
    window.setTimeout(() => navigate('/', { replace: true }), 1500)
  }

  if (listo) {
    return (
      <div className="min-h-full flex items-center justify-center p-6 bg-gray-50">
        <div className="card w-full max-w-md text-center">
          <div className="text-4xl mb-3">✅</div>
          <h1 className="text-xl font-extrabold text-bandera-azul mb-2">
            Contraseña actualizada
          </h1>
          <p className="text-gray-600">Entrando…</p>
        </div>
      </div>
    )
  }

  if (sesionOk === false) {
    return (
      <div className="min-h-full flex items-center justify-center p-6 bg-gray-50">
        <div className="card w-full max-w-md text-center">
          <div className="text-4xl mb-3">⏳</div>
          <h1 className="text-xl font-extrabold text-bandera-azul mb-2">
            Enlace no válido o vencido
          </h1>
          <p className="text-gray-600">
            Pide un enlace nuevo para crear tu contraseña.
          </p>
          <Link to="/recuperar" className="btn-azul w-full mt-5">
            Pedir enlace nuevo
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-full flex items-center justify-center p-6 bg-gray-50">
      <div className="card w-full max-w-md">
        <h1 className="text-2xl font-extrabold text-bandera-azul mb-1">
          Nueva contraseña
        </h1>
        <p className="text-gray-600 mb-5 text-sm">
          Escribe la contraseña con la que entrarás de ahora en adelante.
        </p>
        <form onSubmit={guardar} className="space-y-4">
          <div className="relative">
            <input
              type={verPass ? 'text' : 'password'}
              required
              className="input pr-12"
              placeholder="Nueva contraseña (mínimo 6 caracteres)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setVerPass((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-lg"
              aria-label={verPass ? 'Ocultar contraseña' : 'Ver contraseña'}
            >
              {verPass ? '🙈' : '👁️'}
            </button>
          </div>
          {errorMsg && <p className="text-bandera-rojo text-sm">⚠️ {errorMsg}</p>}
          <button
            type="submit"
            disabled={guardando || sesionOk === null}
            className="btn-azul w-full text-xl py-4 disabled:opacity-60"
          >
            {guardando
              ? 'Guardando…'
              : sesionOk === null
                ? 'Verificando enlace…'
                : 'Guardar contraseña'}
          </button>
        </form>
      </div>
    </div>
  )
}
