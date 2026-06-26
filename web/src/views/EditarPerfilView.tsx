import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { ESTADOS_VENEZUELA, ROL_META } from '../lib/types'

/** Editar mis datos de perfil y subir/cambiar mi foto. */
export default function EditarPerfilView() {
  const { perfil, rol, refrescarPerfil } = useAuth()
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)

  const [nombre, setNombre] = useState(perfil?.nombre ?? '')
  const [telefono, setTelefono] = useState(perfil?.telefono ?? '')
  const [ciudad, setCiudad] = useState(perfil?.ciudad ?? '')
  const [estado, setEstado] = useState(perfil?.estado ?? '')
  const [fotoUrl, setFotoUrl] = useState(perfil?.foto_url ?? '')

  const [subiendo, setSubiendo] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const meta = rol ? ROL_META[rol] : null

  async function elegirFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !perfil?.id) return
    if (file.size > 5 * 1024 * 1024) {
      setErrorMsg('La imagen es muy pesada (máximo 5 MB).')
      return
    }
    setErrorMsg('')
    setSubiendo(true)
    try {
      const ext = file.name.split('.').pop() || 'jpg'
      const ruta = `${perfil.id}/${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage
        .from('avatares')
        .upload(ruta, file, { upsert: true })
      if (upErr) throw upErr
      const { data } = supabase.storage.from('avatares').getPublicUrl(ruta)
      setFotoUrl(data.publicUrl)
    } catch (err) {
      setErrorMsg(
        'No se pudo subir la foto. ' + ((err as Error).message ?? ''),
      )
    } finally {
      setSubiendo(false)
    }
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    if (!perfil?.id) return
    setGuardando(true)
    setErrorMsg('')
    const { error } = await supabase
      .from('perfiles')
      .update({
        nombre: nombre.trim() || null,
        telefono: telefono.trim() || null,
        ciudad: ciudad.trim() || null,
        estado: estado || null,
        foto_url: fotoUrl || null,
      })
      .eq('id', perfil.id)
    if (error) {
      setErrorMsg(error.message)
      setGuardando(false)
      return
    }
    await refrescarPerfil()
    navigate('/perfil')
  }

  return (
    <div className="max-w-md mx-auto p-4 space-y-4">
      <h1 className="text-2xl font-extrabold text-bandera-azul">Editar perfil</h1>

      <form onSubmit={guardar} className="card space-y-4">
        {/* Foto */}
        <div className="flex flex-col items-center gap-3">
          <div className="h-24 w-24 rounded-full bg-bandera-azul/10 overflow-hidden flex items-center justify-center text-4xl">
            {fotoUrl ? (
              <img
                src={fotoUrl}
                alt="Tu foto"
                className="h-full w-full object-cover"
              />
            ) : (
              <span>{meta?.emoji ?? '👤'}</span>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={elegirFoto}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={subiendo}
            className="btn-gris py-2 px-4 disabled:opacity-60"
          >
            {subiendo ? 'Subiendo…' : '📷 Elegir foto'}
          </button>
        </div>

        <label className="block text-sm font-semibold">
          Nombre
          <input
            className="input mt-1"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Nombre y apellido"
          />
        </label>

        <label className="block text-sm font-semibold">
          Teléfono
          <input
            className="input mt-1"
            inputMode="tel"
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
            placeholder="Teléfono"
          />
        </label>

        <div className="grid grid-cols-2 gap-2">
          <label className="block text-sm font-semibold">
            Estado
            <select
              className="input mt-1"
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
          </label>
          <label className="block text-sm font-semibold">
            Ciudad
            <input
              className="input mt-1"
              value={ciudad}
              onChange={(e) => setCiudad(e.target.value)}
              placeholder="Ciudad"
            />
          </label>
        </div>

        {errorMsg && <p className="text-bandera-rojo text-sm">⚠️ {errorMsg}</p>}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => navigate('/perfil')}
            className="btn-gris flex-1"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={guardando || subiendo}
            className="btn-verde flex-1 disabled:opacity-60"
          >
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </form>
    </div>
  )
}
