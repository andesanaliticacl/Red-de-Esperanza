import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import imageCompression from 'browser-image-compression'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import EntradaTelefono, {
  esTelefonoVenezuelaValido,
  mensajeTelefonoVenezuela,
} from '../components/EntradaTelefono'
import RolesInfoModal from '../components/RolesInfoModal'
import SelectorBandera from '../components/SelectorBandera'
import SolicitarPsicologoModal from '../components/SolicitarPsicologoModal'
import { PAISES_MUNDO } from '../lib/paises'
import {
  misSolicitudesPsicologo,
  type SolicitudPsicologo,
} from '../lib/solicitudesPsicologo'
import {
  ESTADOS_VENEZUELA,
  ROL_META,
  type RolRegistro,
  type TipoDocumento,
} from '../lib/types'

// 'psicologo' NO se autoasigna: lo otorga el equipo tras revisar una
// solicitud (ver SolicitarPsicologoModal / lib/solicitudesPsicologo.ts).
const ROLES_ELEGIBLES: Exclude<RolRegistro, 'psicologo'>[] = [
  'ciudadano',
  'voluntario',
  'rescatista',
  'centro_acopio',
]
const OPCIONES_PAIS = PAISES_MUNDO.map((p) => ({
  value: p.nombre,
  iso: p.iso,
  etiqueta: p.nombre,
}))

/** Editar mis datos de perfil y subir/cambiar mi foto. */
export default function EditarPerfilView() {
  const { perfil, rol, refrescarPerfil } = useAuth()
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)

  const [nombre, setNombre] = useState(perfil?.nombre ?? '')
  const [telefono, setTelefono] = useState(perfil?.telefono ?? '')
  const [tipoDoc, setTipoDoc] = useState<TipoDocumento>(
    perfil?.tipo_documento ?? 'cedula',
  )
  const [documento, setDocumento] = useState(perfil?.documento ?? '')
  const [ciudad, setCiudad] = useState(perfil?.ciudad ?? '')
  const [estado, setEstado] = useState(perfil?.estado ?? '')
  const [pais, setPais] = useState(perfil?.pais ?? 'Venezuela')
  const [fotoUrl, setFotoUrl] = useState(perfil?.foto_url ?? '')
  const [nuevoRol, setNuevoRol] = useState<Exclude<RolRegistro, 'psicologo'> | null>(
    rol && (ROLES_ELEGIBLES as string[]).includes(rol)
      ? (rol as Exclude<RolRegistro, 'psicologo'>)
      : null,
  )

  const [subiendo, setSubiendo] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [verRoles, setVerRoles] = useState(false)
  const meta = rol ? ROL_META[rol] : null
  // El selector de rol solo aparece para roles "elegibles" (no admin/verificador).
  const puedeCambiarRol = rol ? (ROLES_ELEGIBLES as string[]).includes(rol) : false
  // Todos los roles autoasignables están disponibles desde cualquier país.
  const rolesElegibles: Exclude<RolRegistro, 'psicologo'>[] = ROLES_ELEGIBLES

  // "Quiero ser psicólogo/a": solicitud aparte, no un rol autoasignable.
  // Solo tiene sentido ofrecerla a quien todavía no es del equipo.
  const puedeSolicitarPsicologo =
    rol != null && rol !== 'psicologo' && rol !== 'lider_psicologo' && rol !== 'admin'
  const [solicitudPsico, setSolicitudPsico] = useState<SolicitudPsicologo | null>(null)
  const [abrirSolicitudPsico, setAbrirSolicitudPsico] = useState(false)

  useEffect(() => {
    if (!puedeSolicitarPsicologo) return
    misSolicitudesPsicologo()
      .then((lista) => setSolicitudPsico(lista[0] ?? null))
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puedeSolicitarPsicologo])

  async function elegirFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !perfil?.id) return
    setErrorMsg('')
    setSubiendo(true)
    try {
      // Fase 8: comprimimos a WebP ~1200px/80% antes de subir (reduce ~90%).
      const comprimida = await imageCompression(file, {
        maxSizeMB: 0.3,
        maxWidthOrHeight: 1200,
        useWebWorker: true,
        fileType: 'image/webp',
        initialQuality: 0.8,
      })
      const ruta = `${perfil.id}/${Date.now()}.webp`
      const { error: upErr } = await supabase.storage
        .from('avatares')
        .upload(ruta, comprimida, { upsert: true, contentType: 'image/webp' })
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
    if (telefono.trim() && !esTelefonoVenezuelaValido(telefono)) {
      setErrorMsg(mensajeTelefonoVenezuela())
      return
    }
    setGuardando(true)
    setErrorMsg('')
    const { error } = await supabase
      .from('perfiles')
      .update({
        nombre: nombre.trim() || null,
        telefono: telefono.trim() || null,
        tipo_documento: tipoDoc,
        documento: documento.trim() || null,
        ciudad: ciudad.trim() || null,
        estado: estado || null,
        pais: pais || null,
        foto_url: fotoUrl || null,
        // Solo cambia el rol si es un rol elegible (no admin/verificador).
        ...(puedeCambiarRol && nuevoRol ? { rol: nuevoRol } : {}),
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

        {/* País */}
        {puedeCambiarRol && (
          <div>
            <p className="text-sm font-semibold mb-1">¿En qué país estás?</p>
            <SelectorBandera
              opciones={OPCIONES_PAIS}
              valor={pais}
              onChange={(v) => setPais(v)}
            />
          </div>
        )}

        {/* Cambiar mi rol (solo entre roles elegibles) */}
        {puedeCambiarRol && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold">¿Cómo participas?</p>
              <button
                type="button"
                onClick={() => setVerRoles(true)}
                className="text-xs text-bandera-azul font-semibold underline"
              >
                ¿Qué rol elegir?
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {rolesElegibles.map((r) => (
                <button
                  type="button"
                  key={r}
                  onClick={() => setNuevoRol(r)}
                  className={`card text-left p-3 border-2 ${
                    nuevoRol === r ? 'border-bandera-azul' : 'border-transparent'
                  }`}
                >
                  <div className="font-bold text-sm">
                    {ROL_META[r].emoji} {ROL_META[r].etiqueta}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        <label className="block text-sm font-semibold">
          Nombre
          <input
            className="input mt-1"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Nombre y apellido"
          />
        </label>

        <div>
          <p className="text-sm font-semibold mb-1">Teléfono</p>
          <EntradaTelefono valor={telefono} onChange={setTelefono} />
        </div>

        {/* Documento: cédula o pasaporte */}
        <div>
          <p className="text-sm font-semibold mb-1">Documento</p>
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
            value={documento}
            onChange={(e) => setDocumento(e.target.value)}
            placeholder={
              tipoDoc === 'cedula'
                ? pais === 'Chile'
                  ? 'Ej: 12.345.678-5'
                  : 'Ej: V-12345678'
                : 'N.º de pasaporte'
            }
          />
        </div>

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

        {/* Solicitud aparte: el rol psicólogo lo otorga el equipo, no se
            autoasigna aquí. */}
        {puedeSolicitarPsicologo && (
          <div className="rounded-2xl border-2 border-purple-100 bg-purple-50/60 p-3">
            {solicitudPsico?.estado === 'pendiente' ? (
              <p className="text-sm text-purple-900">
                🧠 Tu solicitud para ser psicólogo/a está en revisión. El
                equipo te contactará por teléfono.
              </p>
            ) : solicitudPsico?.estado === 'rechazada' ? (
              <div className="space-y-2">
                <p className="text-sm text-purple-900">
                  🧠 Tu solicitud anterior no fue aprobada
                  {solicitudPsico.nota_revision
                    ? `: ${solicitudPsico.nota_revision}`
                    : '.'}
                </p>
                <button
                  type="button"
                  onClick={() => setAbrirSolicitudPsico(true)}
                  className="text-sm font-bold text-bandera-azul"
                >
                  Volver a solicitar
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setAbrirSolicitudPsico(true)}
                className="text-sm font-bold text-bandera-azul"
              >
                🧠 ¿Quieres ser psicólogo/a? Solicítalo aquí
              </button>
            )}
          </div>
        )}

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
      {verRoles && <RolesInfoModal onCerrar={() => setVerRoles(false)} />}
      {abrirSolicitudPsico && (
        <SolicitarPsicologoModal
          nombreInicial={nombre}
          telefonoInicial={telefono}
          paisInicial={pais}
          onCerrar={() => setAbrirSolicitudPsico(false)}
          onEnviada={() => {
            setAbrirSolicitudPsico(false)
            misSolicitudesPsicologo()
              .then((lista) => setSolicitudPsico(lista[0] ?? null))
              .catch(() => {})
          }}
        />
      )}
    </div>
  )
}
