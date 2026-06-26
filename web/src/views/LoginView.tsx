import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function LoginView() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [cargando, setCargando] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [aviso, setAviso] = useState('')

  async function ingresar(e: React.FormEvent) {
    e.preventDefault()
    setErrorMsg('')
    setAviso('')
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
      navigate('/inicio', { replace: true })
    }
  }

  // Alternativa sin contraseña (enlace mágico al correo).
  async function enlaceMagico() {
    if (!email.trim()) {
      setErrorMsg('Escribe tu correo para enviarte el enlace.')
      return
    }
    setErrorMsg('')
    setCargando(true)
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/inicio` },
    })
    setCargando(false)
    if (error) setErrorMsg(error.message)
    else setAviso('Te enviamos un enlace de acceso. Revisa tu correo.')
  }

  return (
    <div className="min-h-full flex flex-col items-center justify-center p-6 bg-gray-50">
      <div className="card w-full max-w-md">
        <h1 className="text-2xl font-extrabold text-bandera-azul mb-1">
          Iniciar sesión
        </h1>
        <p className="text-gray-600 mb-5 text-sm">
          Para ciudadanos registrados, voluntarios, rescatistas y equipo.
        </p>

        {aviso ? (
          <div className="rounded-xl bg-green-50 text-green-800 p-4">
            ✅ {aviso}
          </div>
        ) : (
          <form onSubmit={ingresar} className="space-y-4">
            <input
              type="email"
              required
              className="input"
              placeholder="tucorreo@ejemplo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <input
              type="password"
              required
              className="input"
              placeholder="Contraseña"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {errorMsg && <p className="text-bandera-rojo text-sm">⚠️ {errorMsg}</p>}
            <button
              type="submit"
              disabled={cargando}
              className="btn-azul w-full text-xl py-4 disabled:opacity-60"
            >
              {cargando ? 'Entrando…' : '➡️ Entrar'}
            </button>
            <button
              type="button"
              onClick={enlaceMagico}
              className="w-full text-sm text-bandera-azul font-semibold"
            >
              Entrar con enlace mágico (sin contraseña)
            </button>
          </form>
        )}

        <div className="mt-6 pt-5 border-t text-center">
          <p className="text-gray-600 mb-3">¿No tienes cuenta todavía?</p>
          <Link
            to="/registro"
            className="btn-verde w-full text-xl py-4 no-underline"
          >
            ✨ Crear una cuenta
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
