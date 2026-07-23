import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import {
  listarChat,
  enviarChat,
  borrarChat,
  suscribirChat,
  telefonosDeChat,
  telefonosDeUsuarios,
} from '../lib/chatGlobal'
import { leerIdentidad, guardarIdentidad } from '../lib/identidad'
import { paisPorIP } from '../lib/visitas'
import EntradaTelefono, { esTelefonoValido } from './EntradaTelefono'
import { PAISES_CHAT, regionesDe, claveSala } from '../lib/regionesChat'
import {
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
  psicologo: '#7C3AED',
  centro_acopio: '#16A34A',
  acopio_admin: '#0891B2',
  lider_voluntarios: '#B45309',
  lider_psicologo: '#6D28D9',
  verificador: '#7C3AED',
  admin: '#CF9B00',
}

function fragmento(texto: string, max = 120): string {
  const limpio = texto.replace(/\s+/g, ' ').trim()
  return limpio.length > max ? `${limpio.slice(0, max).trim()}...` : limpio
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
  // Solo los líderes (y admin) pueden ver el teléfono de los
  // invitados para contactarlos. El resto del chat no lo ve (la RLS lo impide).
  const esLiderOAdmin =
    rol === 'lider_voluntarios' || rol === 'lider_psicologo' || rol === 'admin'
  const esAdmin = rol === 'admin'
  const guardada = leerIdentidad()
  // Si la persona ya inició sesión, su nombre es automático (el de su perfil) y
  // solo puede elegir/rotar su estado. Sin cuenta, sí pide un apodo.
  const esLogueado = Boolean(perfil?.id)
  const nombreEfectivo = esLogueado
    ? perfil?.nombre?.split(' ')[0] || 'Yo'
    : ''
  const [nombre, setNombre] = useState(guardada?.nombre ?? '')
  // País de la sala: Venezuela y Chile por ahora (se pueden sumar más en
  // lib/regionesChat.ts). Se preselecciona con el país detectado por IP si
  // está entre los disponibles; si no, Chile (la emergencia activa ahora
  // mismo), con Coquimbo como región inicial. Todo se puede cambiar.
  const [paisChat, setPaisChat] = useState(
    guardada?.pais ?? PAISES_CHAT[0].pais,
  )
  const [estado, setEstado] = useState(
    guardada?.estado ?? perfil?.estado ?? 'Coquimbo',
  )
  // Teléfono del invitado (registro express), para poder contactarlo.
  const [telefono, setTelefono] = useState(guardada?.telefono ?? '')
  const [listo, setListo] = useState(Boolean(guardada))
  const tokenPruebaChat = import.meta.env.DEV
    ? ((import.meta.env.VITE_CHAT_DEV_BYPASS_TOKEN as string | undefined) ?? '').trim()
    : ''
  // El chat en vivo ya es abierto: cualquiera que elija un país/región
  // disponible puede participar (antes solo se dejaba escribir desde
  // Venezuela). La sala en sí ya delimita con quién se conversa.
  const regionesDisponibles = regionesDe(paisChat)
  const sala = estado ? claveSala(paisChat, estado) : ''
  // ¿El invitado puso un teléfono válido? Obligatorio sin sesión.
  const telefonoValido = esTelefonoValido(telefono)

  const [mensajes, setMensajes] = useState<MensajeGlobal[]>([])
  const [texto, setTexto] = useState('')
  const [respuestaA, setRespuestaA] = useState<{
    id: string
    nombre: string
    cuerpo: string
  } | null>(null)
  const [cargando, setCargando] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  // Rol de cada autor (id → rol), para mostrar la etiqueta de color junto al
  // nombre. Se resuelve con la vista pública perfiles_publicos.
  const [roles, setRoles] = useState<Map<string, RolUsuario>>(new Map())
  // Teléfonos por mensaje (id → teléfono). Solo se llenan para líderes/admin.
  const [telefonos, setTelefonos] = useState<Map<string, string>>(new Map())
  const finRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Solo preseleccionamos automáticamente si la persona NO tiene ya una
    // sala guardada (para no cambiarle la sala a alguien que vuelve).
    if (guardada) return
    let activo = true
    paisPorIP().then(({ pais }) => {
      if (!activo || !pais) return
      const encontrado = PAISES_CHAT.find(
        (p) => p.pais.toLowerCase() === pais.trim().toLowerCase(),
      )
      if (encontrado) setPaisChat(encontrado.pais)
    })
    return () => {
      activo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
    if (!listo || !sala) return
    let activo = true
    setCargando(true)
    listarChat(sala)
      .then((m) => {
        if (!activo) return
        setMensajes(m)
        void asegurarRoles(m.map((x) => x.autor))
        void asegurarTelefonos(m)
      })
      .catch((e) => setErrorMsg((e as Error).message))
      .finally(() => activo && setCargando(false))

    const cancelar = suscribirChat(
      sala,
      (m) => {
        setMensajes((prev) =>
          prev.some((x) => x.id === m.id) ? prev : [...prev, m],
        )
        void asegurarRoles([m.autor])
        void asegurarTelefonos([m])
      },
      (id) => {
        setMensajes((prev) => prev.filter((m) => m.id !== id))
        setTelefonos((prev) => {
          const m = new Map(prev)
          m.delete(id)
          return m
        })
        setRespuestaA((prev) => (prev?.id === id ? null : prev))
      },
    )
    return () => {
      activo = false
      cancelar()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listo, sala])

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
    const nom = esLogueado ? nombreEfectivo : nombre.trim() || 'Visitante'
    // Sin sesión: nombre + país + estado/región + teléfono (para contactar).
    if (!estado.trim()) return
    if (!esLogueado && (!nombre.trim() || !telefonoValido)) return
    guardarIdentidad({
      nombre: nom,
      estado: estado.trim(),
      pais: paisChat,
      telefono: esLogueado ? undefined : telefono.trim(),
    })
    setMensajes([])
    setRespuestaA(null)
    setListo(true)
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (!texto.trim() || !sala) return
    const cuerpo = texto.trim()
    setTexto('')
    setErrorMsg('')
    try {
      await enviarChat({
        ciudad: sala,
        nombre: esLogueado ? nombreEfectivo : nombre,
        cuerpo,
        // Solo el invitado adjunta teléfono; el usuario con cuenta no expone el
        // suyo en el chat comunitario.
        telefono: esLogueado ? null : telefono,
        respuestaA,
        devBypassToken: tokenPruebaChat,
      })
      setRespuestaA(null)
    } catch (err) {
      setErrorMsg((err as Error).message)
      setTexto(cuerpo)
    }
  }

  async function borrarMensaje(m: MensajeGlobal) {
    if (!esAdmin) return
    if (!window.confirm('¿Borrar este mensaje del chat?')) return
    setErrorMsg('')
    try {
      await borrarChat(m.id)
      setMensajes((prev) => prev.filter((x) => x.id !== m.id))
      setTelefonos((prev) => {
        const copia = new Map(prev)
        copia.delete(m.id)
        return copia
      })
      setRespuestaA((prev) => (prev?.id === m.id ? null : prev))
    } catch (err) {
      setErrorMsg((err as Error).message)
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
            {paisChat !== PAISES_CHAT[0].pais ? `, ${paisChat}` : ''}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {/* Quien escribe sin cuenta ve una salida directa a crear una: así
              el chat también es una puerta de entrada a la red. */}
          {!esLogueado && (
            <Link
              to="/registro?rol=voluntario"
              onClick={() => onCerrar?.()}
              className="text-[11px] font-bold bg-white text-bandera-azul px-2.5 py-1 rounded-full whitespace-nowrap no-underline hover:bg-gray-100"
            >
              ❤️ Crear Cuenta
            </Link>
          )}
          {listo && (
            <button
              onClick={() => setListo(false)}
              className="text-base opacity-90 hover:opacity-100"
              title={esLogueado ? 'Cambiar estado' : 'Cambiar estado o apodo'}
              aria-label="Ajustes del chat"
            >
              ⚙️
            </button>
          )}
          {onCerrar && (
            <button
              onClick={onCerrar}
              className="text-2xl leading-none"
              aria-label="Cerrar"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {!listo ? (
        // Ajustes / identidad (apodo + país + estado/región)
        <form onSubmit={entrar} className="p-4 space-y-3 flex-1">
          <p className="text-sm text-gray-600">
            Conversa con la gente de tu zona.{' '}
            {esLogueado
              ? 'Elige tu país y tu estado o región para entrar al chat comunitario.'
              : 'Elige tu nombre, tu país y tu estado o región para entrar al chat comunitario.'}
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
                  <strong>líder</strong> o un{' '}
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
            País
            <select
              className="input mt-1"
              value={paisChat}
              onChange={(e) => {
                setPaisChat(e.target.value)
                setEstado('') // el país cambió: la región elegida ya no aplica
              }}
            >
              {PAISES_CHAT.map((p) => (
                <option key={p.pais} value={p.pais}>
                  {p.pais}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-semibold">
            {paisChat === 'Venezuela' ? 'Estado' : 'Región'}
            <select
              className="input mt-1"
              value={estado}
              onChange={(e) => setEstado(e.target.value)}
            >
              <option value="">
                Elige tu {paisChat === 'Venezuela' ? 'estado' : 'región'}…
              </option>
              {regionesDisponibles.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={!estado.trim() || (!esLogueado && (!nombre.trim() || !telefonoValido))}
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
                      {m.respuesta_nombre && m.respuesta_cuerpo && (
                        <div
                          className={`mb-1.5 rounded-md border-l-4 px-2 py-1 text-xs ${
                            mio
                              ? 'bg-white/15 border-white/70 text-white/85'
                              : 'bg-gray-50 border-bandera-azul text-gray-600'
                          }`}
                        >
                          <div
                            className={`font-bold truncate ${
                              mio ? 'text-white' : 'text-bandera-azul'
                            }`}
                          >
                            {m.respuesta_nombre}
                          </div>
                          <div className="line-clamp-2 break-words">
                            {fragmento(m.respuesta_cuerpo, 120)}
                          </div>
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
                      <button
                        type="button"
                        onClick={() =>
                          setRespuestaA({
                            id: m.id,
                            nombre: m.nombre,
                            cuerpo: m.cuerpo,
                          })
                        }
                        className={`mt-1 text-[11px] font-semibold ${
                          mio ? 'text-white/80' : 'text-bandera-azul'
                        }`}
                      >
                        Responder
                      </button>
                      {esAdmin && (
                        <button
                          type="button"
                          onClick={() => void borrarMensaje(m)}
                          className={`ml-3 mt-1 text-[11px] font-semibold ${
                            mio ? 'text-white/80' : 'text-bandera-rojo'
                          }`}
                        >
                          Borrar
                        </button>
                      )}
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

          {respuestaA && (
            <div className="border-t bg-white px-3 pt-2">
              <div className="flex items-start gap-2 rounded-md border-l-4 border-bandera-azul bg-gray-50 px-2 py-1.5 text-xs">
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-bandera-azul truncate">
                    {respuestaA.nombre}
                  </div>
                  <div className="text-gray-600 truncate">
                    {fragmento(respuestaA.cuerpo, 110)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setRespuestaA(null)}
                  className="text-gray-400 hover:text-gray-700"
                  aria-label="Cancelar respuesta"
                >
                  x
                </button>
              </div>
            </div>
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
