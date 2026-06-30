import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import {
  listarMensajes,
  enviarMensaje,
  suscribirMensajes,
} from '../lib/mensajes'
import type { Mensaje } from '../lib/types'

/**
 * Chat por necesidad. Lo usan el reportante (si tiene cuenta) y el personal
 * que atiende (voluntario/rescatista/verificador/admin). Se abre como modal.
 */
export default function ChatNecesidad({
  necesidadId,
  titulo,
  onCerrar,
}: {
  necesidadId: string
  titulo?: string
  onCerrar: () => void
}) {
  const { perfil } = useAuth()
  const [mensajes, setMensajes] = useState<Mensaje[]>([])
  const [texto, setTexto] = useState('')
  const [cargando, setCargando] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const finRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let activo = true
    listarMensajes(necesidadId)
      .then((m) => {
        if (activo) setMensajes(m)
      })
      .catch((e) => setErrorMsg((e as Error).message))
      .finally(() => activo && setCargando(false))

    const cancelar = suscribirMensajes(necesidadId, (m) => {
      setMensajes((prev) =>
        prev.some((x) => x.id === m.id) ? prev : [...prev, m],
      )
    })
    return () => {
      activo = false
      cancelar()
    }
  }, [necesidadId])

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensajes])

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (!texto.trim()) return
    setEnviando(true)
    setErrorMsg('')
    try {
      await enviarMensaje(necesidadId, texto)
      setTexto('')
    } catch (e) {
      setErrorMsg((e as Error).message)
    }
    setEnviando(false)
  }

  return (
    <div className="fixed inset-0 z-[2000] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl flex flex-col max-h-[90vh] h-[80vh]">
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <h2 className="font-extrabold text-bandera-azul">Mensajes</h2>
            {titulo && <p className="text-xs text-gray-500">{titulo}</p>}
          </div>
          <button
            onClick={onCerrar}
            className="text-2xl text-gray-400 leading-none"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-gray-50">
          {cargando ? (
            <p className="text-center text-gray-400 text-sm">Cargando…</p>
          ) : mensajes.length === 0 ? (
            <p className="text-center text-gray-400 text-sm mt-6">
              Aún no hay mensajes. Escribe el primero para coordinar la ayuda.
            </p>
          ) : (
            mensajes.map((m) => {
              const mio = m.autor === perfil?.id
              return (
                <div
                  key={m.id}
                  className={`flex ${mio ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                      mio
                        ? 'bg-bandera-azul text-white rounded-br-sm'
                        : 'bg-white border rounded-bl-sm'
                    }`}
                  >
                    {m.cuerpo}
                    <div
                      className={`text-[10px] mt-1 ${
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
          <p className="px-4 text-bandera-rojo text-sm">⚠️ {errorMsg}</p>
        )}

        <form onSubmit={enviar} className="p-3 border-t flex gap-2">
          <input
            className="input flex-1"
            placeholder="Escribe un mensaje…"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />
          <button
            type="submit"
            disabled={enviando || !texto.trim()}
            className="btn-azul px-4 disabled:opacity-50"
          >
            Enviar
          </button>
        </form>
      </div>
    </div>
  )
}
