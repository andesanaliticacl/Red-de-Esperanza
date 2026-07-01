import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import {
  listarChat,
  enviarChat,
  suscribirChat,
  telefonosDeChat,
  telefonosDeUsuarios,
} from '../lib/chatGlobal'
import { leerIdentidad, guardarIdentidad } from '../lib/identidad'
import EntradaTelefono from './EntradaTelefono'
import {
  ESTADOS_VENEZUELA,
  ROL_META,
  type MensajeGlobal,
  type RolUsuario,
} from '../lib/types'

// Color distintivo por rol (mismo criterio que el panel de administración),
// para que de un vistazo se distinga quién es rescatista, voluntario, etc.
const COLOR_ROL: Record<RolUsuario, string> = {
  ciudadano: '#475569',
  voluntario: '#002FA7',
  rescatista: '#CC0001',
  centro_acopio: '#16A34A',
  acopio_admin: '#0891B2',
  lider_voluntarios: '#B45309',
  verificador: '#7C3AED',
  admin: '#CF9B00',
}

/**
 * Etiqueta del rol que va junto al nombre en cada mensaje.
 * - Sin cuenta (autor null) → "Sin iniciar sesión" en gris.
 * - Con cuenta pero rol aún cargando → no muestra nada (aparece al resolver).
 * - Con cuenta → pastilla del color del rol.
 */
function EtiquetaRol({
  autor,
  rol,
}: {
  autor: string | null
  rol?: RolUsuario
}) {
  if (!autor) {
    return (
      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">
        👤 Sin iniciar sesión
      </span>
    )
  }
  if (!rol) return null
  const meta = ROL_META[rol]
  const color = COLOR_ROL[rol]
  return (
    <span
      className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
      style={{ color, backgroundColor: `${color}1A` }}
    >
      {meta.emoji} {meta.etiqueta}
    </span>
  )
}

/**
 * Chat global comunitario, agrupado por estado de Venezuela. Rellena el alto de
 * su contenedor: se usa como barra lateral en escritorio y como modal en móvil.
 * Sin cuenta, pide un apodo y el estado (se recuerdan en el dispositivo).
 */
export default function ChatGlobal({ onCerrar }: { onCerrar?: () => void }) {
  const { perfil, rol } = useAuth()
  // Solo los líderes de voluntarios (y admin) pueden ver el teléfono de los
  // invitados para contactarlos. El resto del chat no lo ve (la RLS lo impide).
  const esLiderOAdmin = rol === 'lider_voluntarios' || rol === 'admin'
  const guardada = leerIdentidad()
  // Si la persona ya inició sesión, su nombre es automático (el de su perfil) y
  // solo puede elegir/rotar su estado. Sin cuenta, sí pide un apodo.
  const esLogueado = Boolean(perfil?.id)
  const nombreEfectivo = esLogueado
    ? perfil?.nombre?.split(' ')[0] || 'Yo'
    : ''
  const [nombre, setNombre] = useState(guardada?.nombre ?? '')
  const [estado, setEstado] = useState(guardada?.estado ?? perfil?.estado ?? '')
  // Teléfono del invitado (registro express), para poder contactarlo.
  const [telefono, setTelefono] = useState(guardada?.telefono ?? '')
  const [listo, setListo] = useState(Boolean(guardada))
  // ¿El invitado puso un teléfono válido? (mín. 8 dígitos). Obligatorio sin sesión.
  const telefonoValido = telefono.replace(/\D/g, '').length >= 8

  const [mensajes, setMensajes] = useState<MensajeGlobal[]>([])
  const [texto, setTexto] = useState('')
  const [cargando, setCargando] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  // Rol de cada autor (id → rol), para mostrar la etiqueta de color junto al
  // nombre. Se resuelve con la vista pública perfiles_publicos.
  const [roles, setRoles] = useState<Map<string, RolUsuario>>(new Map())
  // Teléfonos por mensaje (id → teléfono). Solo se llenan para líderes/admin.
  const [telefonos, setTelefonos] = useState<Map<string, string>>(new Map())
  const finRef = useRef<HTMLDivElement>(null)

  // Trae los teléfonos (privados) de los mensajes dados. Solo para líderes/admin.
  // Invitados: su teléfono está en chat_contactos (por id de mensaje).
  // Registrados: su teléfono está en su perfil (por id de autor).
  async function asegurarTelefonos(msgs: MensajeGlobal[]) {
    if (!esLiderOAdmin) return
    const faltan = msgs.filter((m) => !telefonos.has(m.id))
    if (faltan.length === 0) return

    const idsInvitados = faltan.filter((m) => !m.autor).map((m) => m.id)
    const idsAutores = [
      ...new Set(
        faltan.filter((m) => m.autor).map((m) => m.autor as string),
      ),
    ]

    const [porMensaje, porAutor] = await Promise.all([
      telefonosDeChat(idsInvitados),
      telefonosDeUsuarios(idsAutores),
    ])
    if (porMensaje.size === 0 && porAutor.size === 0) return

    setTelefonos((prev) => {
      const m = new Map(prev)
      // Invitados: directo por id de mensaje.
      for (const [k, v] of porMensaje) m.set(k, v)
      // Registrados: el teléfono del autor se asigna a cada uno de sus mensajes.
      for (const msg of faltan) {
        const tel = msg.autor ? porAutor.get(msg.autor) : undefined
        if (tel) m.set(msg.id, tel)
      }
      return m
    })
  }

  // Busca los roles que falten para los autores recibidos y los agrega al mapa.
  async function asegurarRoles(autores: (string | null)[]) {
    const faltan = [
      ...new Set(autores.filter((a): a is string => Boolean(a))),
    ].filter((id) => !roles.has(id))
    if (faltan.length === 0) return
    const { data } = await supabase
      .from('perfiles_publicos')
      .select('id, rol')
      .in('id', faltan)
    if (!data) return
    setRoles((prev) => {
      const m = new Map(prev)
      for (const p of data as { id: string; rol: RolUsuario }[]) m.set(p.id, p.rol)
      return m
    })
  }

  useEffect(() => {
    if (!listo || !estado.trim()) return
    let activo = true
    setCargando(true)
    listarChat(estado)
      .then((m) => {
        if (!activo) return
        setMensajes(m)
        void asegurarRoles(m.map((x) => x.autor))
        void asegurarTelefonos(m)
      })
      .catch((e) => setErrorMsg((e as Error).message))
      .finally(() => activo && setCargando(false))

    const cancelar = suscribirChat(estado, (m) => {
      setMensajes((prev) =>
        prev.some((x) => x.id === m.id) ? prev : [...prev, m],
      )
      void asegurarRoles([m.autor])
      void asegurarTelefonos([m])
    })
    return () => {
      activo = false
      cancelar()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listo, estado])

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensajes])

  // Si el rol (admin/líder) se resuelve DESPUÉS de abrir el chat, o cambia,
  // pedimos los teléfonos que falten de los mensajes ya cargados. Sin esto, si
  // la sesión tardaba en cargar el rol, los botones no aparecían.
  useEffect(() => {
    if (esLiderOAdmin && mensajes.length) void asegurarTelefonos(mensajes)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [esLiderOAdmin])

  function entrar(e: React.FormEvent) {
    e.preventDefault()
    const nom = esLogueado ? nombreEfectivo : nombre.trim()
    // Sin sesión: nombre + estado + teléfono (para poder contactar).
    if (!nom || !estado.trim()) return
    if (!esLogueado && !telefonoValido) return
    guardarIdentidad({
      nombre: nom,
      estado: estado.trim(),
      telefono: esLogueado ? undefined : telefono.trim(),
    })
    setMensajes([])
    setListo(true)
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (!texto.trim()) return
    const cuerpo = texto.trim()
    setTexto('')
    setErrorMsg('')
    try {
      await enviarChat({
        ciudad: estado,
        nombre: esLogueado ? nombreEfectivo : nombre,
        cuerpo,
        // Solo el invitado adjunta teléfono; el usuario con cuenta no expone el
        // suyo en el chat comunitario.
        telefono: esLogueado ? null : telefono,
      })
    } catch (err) {
      setErrorMsg((err as Error).message)
      setTexto(cuerpo)
    }
  }

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Encabezado */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b bg-bandera-azul text-white">
        <span className="font-extrabold flex items-center gap-1.5">
          💬 Chat en vivo
        </span>
        {listo && (
          <span className="text-[11px] bg-white/20 px-2 py-0.5 rounded-full truncate">
            📍 {estado}
          </span>
        )}
        {listo && (
          <button
            onClick={() => setListo(false)}
            className="ml-auto text-base opacity-90 hover:opacity-100"
            title={esLogueado ? 'Cambiar estado' : 'Cambiar estado o apodo'}
            aria-label="Ajustes del chat"
          >
            ⚙️
          </button>
        )}
        {onCerrar && (
          <button
            onClick={onCerrar}
            className={`${listo ? '' : 'ml-auto'} text-2xl leading-none`}
            aria-label="Cerrar"
          >
            ✕
          </button>
        )}
      </div>

      {!listo ? (
        // Ajustes / identidad (apodo + estado)
        <form onSubmit={entrar} className="p-4 space-y-3 flex-1">
          <p className="text-sm text-gray-600">
            Conversa con la gente de tu estado.{' '}
            {esLogueado
              ? 'Elige tu estado para entrar al chat comunitario.'
              : 'Elige tu nombre y tu estado para entrar al chat comunitario.'}
          </p>
          {esLogueado ? (
            // Logueado: el nombre es automático (no se vuelve a pedir). Solo
            // se muestra cómo va a aparecer, con su rol.
            <div className="rounded-xl bg-gray-50 border p-3">
              <div className="text-xs text-gray-500">Entrarás como</div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="font-bold">{nombreEfectivo}</span>
                {perfil?.rol && <EtiquetaRol autor={perfil.id} rol={perfil.rol} />}
              </div>
            </div>
          ) : (
            <>
              <label className="block text-sm font-semibold">
                Nombre de la persona
                <input
                  className="input mt-1"
                  placeholder="Tu nombre o apodo"
                  maxLength={40}
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                />
              </label>
              <div>
                <p className="text-sm font-semibold mb-1">
                  Teléfono de contacto
                </p>
                <p className="text-xs text-gray-500 mb-1">
                  📱 <strong>Obligatorio.</strong> Privado: solo un{' '}
                  <strong>líder de voluntarios</strong> o un{' '}
                  <strong>administrador</strong> lo verá y,{' '}
                  <strong className="text-bandera-azul">
                    en caso de ser necesario
                  </strong>
                  , podrá contactarte. No aparece para el resto del chat.
                </p>
                <EntradaTelefono valor={telefono} onChange={setTelefono} requerido />
              </div>
            </>
          )}
          <label className="block text-sm font-semibold">
            Estado
            <select
              className="input mt-1"
              value={estado}
              onChange={(e) => setEstado(e.target.value)}
            >
              <option value="">Elige tu estado…</option>
              {ESTADOS_VENEZUELA.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={
              !estado.trim() ||
              (!esLogueado && (!nombre.trim() || !telefonoValido))
            }
            className="btn-azul w-full disabled:opacity-50"
          >
            Entrar al chat
          </button>
        </form>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-gray-50">
            {cargando ? (
              <p className="text-center text-gray-400 text-sm">Cargando…</p>
            ) : mensajes.length === 0 ? (
              <p className="text-center text-gray-400 text-sm mt-6">
                Sé el primero en saludar a tu comunidad. 🤝
              </p>
            ) : (
              mensajes.map((m) => {
                const mio =
                  (perfil?.id && m.autor === perfil.id) ||
                  (!m.autor && m.nombre === nombre)
                return (
                  <div
                    key={m.id}
                    className={`flex ${mio ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                        mio
                          ? 'bg-bandera-azul text-white rounded-br-sm'
                          : 'bg-white border rounded-bl-sm'
                      }`}
                    >
                      {!mio && (
                        <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                          <span className="text-[11px] font-bold text-bandera-azul">
                            {m.nombre}
                          </span>
                          <EtiquetaRol
                            autor={m.autor}
                            rol={m.autor ? roles.get(m.autor) : undefined}
                          />
                        </div>
                      )}
                      <div className="break-words">{m.cuerpo}</div>
                      {/* Teléfono del invitado: SOLO los líderes/admin lo ven
                          (el mapa solo se llena para ellos) para contactarlo. */}
                      {!mio && telefonos.get(m.id) && (
                        <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                          <span className="text-[11px] font-bold text-bandera-azul break-all">
                            📞 {telefonos.get(m.id)}
                          </span>
                          <a
                            href={`tel:${telefonos
                              .get(m.id)!
                              .replace(/[^\d+]/g, '')}`}
                            className="text-[11px] bg-bandera-azul !text-white font-semibold px-1.5 py-0.5 rounded no-underline"
                          >
                            Llamar
                          </a>
                          <a
                            href={`https://wa.me/${telefonos
                              .get(m.id)!
                              .replace(/\D/g, '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] bg-green-600 !text-white font-semibold px-1.5 py-0.5 rounded no-underline"
                          >
                            WhatsApp
                          </a>
                        </div>
                      )}
                      <div
                        className={`text-[10px] mt-0.5 ${
                          mio ? 'text-white/70' : 'text-gray-400'
                        }`}
                      >
                        {new Date(m.creado_en).toLocaleString('es-VE', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                    </div>
                  </div>
                )
              })
            )}
            <div ref={finRef} />
          </div>

          {errorMsg && (
            <p className="px-3 text-bandera-rojo text-xs">⚠️ {errorMsg}</p>
          )}

          <form onSubmit={enviar} className="p-2.5 border-t flex gap-2">
            <input
              className="input flex-1"
              placeholder="Escribe un mensaje…"
              maxLength={500}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
            />
            <button
              type="submit"
              disabled={!texto.trim()}
              className="btn-azul px-4 disabled:opacity-50"
            >
              ➤
            </button>
          </form>
        </>
      )}
    </div>
  )
}
