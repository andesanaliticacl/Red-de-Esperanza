import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import {
  ESTADOS_VENEZUELA,
  ROL_META,
  type RolRegistro,
  type TipoDocumento,
} from '../lib/types'

const ROLES_REGISTRO: RolRegistro[] = [
  'ciudadano',
  'voluntario',
  'rescatista',
  'centro_acopio',
]

const DESCRIPCION_ROL: Record<RolRegistro, string> = {
  ciudadano: 'Reporto necesidades y sigo el mapa.',
  voluntario: 'Ayudo a atender y coordinar reportes.',
  rescatista: 'Atiendo rescates y emergencias en terreno.',
  centro_acopio: 'Gestiono donaciones y suministros.',
}

export default function RegistroView() {
  const navigate = useNavigate()
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rol, setRol] = useState<RolRegistro>('ciudadano')
  const [tipoDoc, setTipoDoc] = useState<TipoDocumento>('cedula')
  const [documento, setDocumento] = useState('')
  const [telefono, setTelefono] = useState('')
  const [estado, setEstado] = useState('')
  const [ciudad, setCiudad] = useState('')

  const [enviando, setEnviando] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [listo, setListo] = useState<'no' | 'confirmar' | 'sesion'>('no')

  async function registrar(e: React.FormEvent) {
    e.preventDefault()
    setErrorMsg('')
    if (password.length < 6) {
      setErrorMsg('La contraseña debe tener al menos 6 caracteres.')
      return
    }
    setEnviando(true)
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/inicio`,
        data: {
          nombre: nombre.trim(),
          rol,
          tipo_documento: tipoDoc,
          documento: documento.trim(),
          telefono: telefono.trim(),
          ciudad: ciudad.trim(),
          estado,
        },
      },
    })
    if (error) {
      setErrorMsg(error.message)
      setEnviando(false)
      return
    }
    // Si el proyecto exige confirmación por correo no habrá sesión todavía.
    if (data.session) {
      navigate('/inicio', { replace: true })
    } else {
      setListo('confirmar')
    }
    setEnviando(false)
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
          {/* Rol */}
          <div>
            <p className="font-bold mb-2 text-sm">¿Cómo participas?</p>
            <div className="grid grid-cols-2 gap-2">
              {ROLES_REGISTRO.map((r) => (
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

          {/* Estado + ciudad */}
          <div className="grid grid-cols-2 gap-2">
            <select
              className="input"
              required
              value={estado}
              onChange={(e) => setEstado(e.target.value)}
            >
              <option value="">Estado…</option>
              {ESTADOS_VENEZUELA.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <input
              className="input"
              placeholder="Ciudad"
              required
              value={ciudad}
              onChange={(e) => setCiudad(e.target.value)}
            />
          </div>

          <input
            className="input"
            placeholder="Teléfono (opcional)"
            inputMode="tel"
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
          />

          <hr className="border-gray-100" />

          <input
            type="email"
            className="input"
            placeholder="Correo electrónico"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            type="password"
            className="input"
            placeholder="Contraseña (mínimo 6 caracteres)"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          {errorMsg && <p className="text-bandera-rojo text-sm">⚠️ {errorMsg}</p>}

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
    </div>
  )
}
