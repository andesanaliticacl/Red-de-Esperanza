import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

/**
 * Paso 1 de "olvidé mi contraseña": la persona escribe su correo y Supabase
 * le envía un enlace. Al tocarlo, cae en /nueva-clave con una sesión de
 * recuperación (detectSessionInUrl) para poner una clave nueva.
 */
export default function RecuperarClaveView() {
  const [email, setEmail] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [listo, setListo] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setErrorMsg('')
    setEnviando(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/nueva-clave`,
    })
    setEnviando(false)
    if (error) {
      const raw = (error.message || '').toLowerCase()
      // El correo interno de Supabase (sin SMTP propio) tiene un límite muy
      // bajo y a veces devuelve un error vacío ("{}"). Mostramos algo útil.
      if (
        !error.message ||
        error.message === '{}' ||
        raw.includes('rate') ||
        raw.includes('limit') ||
        raw.includes('seconds') ||
        raw.includes('email')
      ) {
        setErrorMsg(
          'No pudimos enviar el correo en este momento (límite de envíos alcanzado o el correo aún no está configurado). Inténtalo de nuevo en unos minutos.',
        )
      } else {
        setErrorMsg(error.message)
      }
      return
    }
    setListo(true)
  }

  if (listo) {
    return (
      <div className="min-h-full flex items-center justify-center p-6 bg-gray-50">
        <div className="card w-full max-w-md text-center">
          <div className="text-4xl mb-3">📩</div>
          <h1 className="text-xl font-extrabold text-bandera-azul mb-2">
            Revisa tu correo
          </h1>
          <p className="text-gray-600">
            Si <b>{email}</b> tiene una cuenta, te enviamos un enlace para crear
            una contraseña nueva. Ábrelo desde este mismo dispositivo.
          </p>
          <Link to="/login" className="btn-azul w-full mt-5">
            Volver a iniciar sesión
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-full flex items-center justify-center p-6 bg-gray-50">
      <div className="card w-full max-w-md">
        <h1 className="text-2xl font-extrabold text-bandera-azul mb-1">
          Recuperar contraseña
        </h1>
        <p className="text-gray-600 mb-5 text-sm">
          Escribe tu correo y te enviaremos un enlace para crear una nueva.
        </p>
        <form onSubmit={enviar} className="space-y-4">
          <input
            type="email"
            required
            className="input"
            placeholder="tucorreo@ejemplo.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          {errorMsg && <p className="text-bandera-rojo text-sm">⚠️ {errorMsg}</p>}
          <button
            type="submit"
            disabled={enviando}
            className="btn-azul w-full text-xl py-4 disabled:opacity-60"
          >
            {enviando ? 'Enviando…' : '📧 Enviar enlace'}
          </button>
        </form>
        <Link
          to="/login"
          className="block text-center mt-4 text-bandera-azul font-semibold text-sm"
        >
          ← Volver a iniciar sesión
        </Link>
      </div>
    </div>
  )
}
