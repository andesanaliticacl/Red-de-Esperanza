import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { listarChat, enviarChat, suscribirChat } from '../lib/chatGlobal'
import { leerIdentidad, guardarIdentidad } from '../lib/identidad'
import type { MensajeGlobal } from '../lib/types'

/**
 * Chat global comunitario, agrupado por ciudad. Rellena el alto de su
 * contenedor: se usa como barra lateral en escritorio y como modal en móvil.
 * Sin cuenta, pide un apodo y la ciudad (se recuerdan en el dispositivo).
 */
export default function ChatGlobal({ onCerrar }: { onCerrar?: () => void }) {
  const { perfil } = useAuth()
  const guardada = leerIdentidad()
  const [nombre, setNombre] = useState(
    guardada?.nombre ?? perfil?.nombre?.split(' ')[0] ?? '',
  )
  const [ciudad, setCiudad] = useState(guardada?.ciudad ?? perfil?.ciudad ?? '')
  const [listo, setListo] = useState(Boolean(guardada))

  const [mensajes, setMensajes] = useState<MensajeGlobal[]>([])
  const [texto, setTexto] = useState('')
  const [cargando, setCargando] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const finRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!listo || !ciudad.trim()) return
    let activo = true
    setCargando(true)
    listarChat(ciudad)
      .then((m) => activo && setMensajes(m))
      .catch((e) => setErrorMsg((e as Error).message))
      .finally(() => activo && setCargando(false))

    const cancelar = suscribirChat(ciudad, (m) => {
      setMensajes((prev) =>
        prev.some((x) => x.id === m.id) ? prev : [...prev, m],
      )
    })
    return () => {
      activo = false
      cancelar()
    }
  }, [listo, ciudad])

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensajes])

  function entrar(e: React.FormEvent) {
    e.preventDefault()
    if (!nombre.trim() || !ciudad.trim()) return
    guardarIdentidad({ nombre: nombre.trim(), ciudad: ciudad.trim() })
    setListo(true)
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (!texto.trim()) return
    const cuerpo = texto.trim()
    setTexto('')
    setErrorMsg('')
    try {
      await enviarChat({ ciudad, nombre, cuerpo })
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
            📍 {ciudad}
          </span>
        )}
        {listo && (
          <button
            onClick={() => setListo(false)}
            className="ml-auto text-xs underline/0 hover:underline opacity-90"
            title="Cambiar ciudad o apodo"
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
        // Paso de identidad (apodo + ciudad)
        <form onSubmit={entrar} className="p-4 space-y-3 flex-1">
          <p className="text-sm text-gray-600">
            Conversa con la gente de tu ciudad. Elige un apodo y tu ciudad para
            entrar al chat comunitario.
          </p>
          <input
            className="input"
            placeholder="Tu apodo o nombre"
            maxLength={40}
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
          />
          <input
            className="input"
            placeholder="Tu ciudad (ej: Caracas)"
            maxLength={60}
            value={ciudad}
            onChange={(e) => setCiudad(e.target.value)}
          />
          <button
            type="submit"
            disabled={!nombre.trim() || !ciudad.trim()}
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
                        <div className="text-[11px] font-bold text-bandera-azul">
                          {m.nombre}
                        </div>
                      )}
                      <div className="break-words">{m.cuerpo}</div>
                      <div
                        className={`text-[10px] mt-0.5 ${
                          mio ? 'text-white/70' : 'text-gray-400'
                        }`}
                      >
                        {new Date(m.creado_en).toLocaleTimeString('es-VE', {
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
