import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { Bell, ChevronRight } from 'lucide-react'
import { useNotificaciones, type Aviso } from '../context/NotificacionesContext'

/**
 * Campana de notificaciones. Muestra cuántos avisos hay sin leer y, al
 * abrirse, la lista. Tocar uno lleva a su pantalla.
 *
 * Hace UNA cosa: mostrar avisos. Antes también traía dentro la configuración
 * de las notificaciones push, que ocupaba el tercio superior del panel cada
 * vez que alguien abría solo a leer. Eso se mudó al menú (BotonAvisosPush),
 * junto a "Instalar app", que es configuración de la misma familia.
 *
 * `claro` = variante para fondos claros (la cabecera del mapa de inicio).
 */
export default function CampanaNotificaciones({ claro = false }: { claro?: boolean }) {
  const { historial, noLeidas, marcarTodasLeidas, marcarLeida, limpiar } =
    useNotificaciones()
  const navigate = useNavigate()
  const [abierto, setAbierto] = useState(false)

  function cerrar() {
    setAbierto(false)
  }

  function alClic(a: Aviso) {
    marcarLeida(a.id)
    if (a.accion) {
      navigate(a.accion.ruta)
      cerrar()
    }
  }

  const disparador = claro
    ? 'bg-white/95 text-bandera-azul shadow'
    : 'bg-white/15 hover:bg-white/25 text-white'

  return (
    <>
      <button
        onClick={() => setAbierto((v) => !v)}
        className={`relative flex items-center justify-center h-10 w-10 rounded-xl ${disparador}`}
        aria-label={
          noLeidas > 0 ? `Notificaciones (${noLeidas} sin leer)` : 'Notificaciones'
        }
        title="Notificaciones"
      >
        <Bell className="h-5 w-5" aria-hidden="true" />
        {noLeidas > 0 && (
          <span className="absolute -top-1 -right-1 bg-bandera-rojo text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center">
            {noLeidas > 9 ? '9+' : noLeidas}
          </span>
        )}
      </button>

      {abierto &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[2400]" onClick={cerrar} />
            <div className="fixed right-2 top-16 z-[2500] w-80 max-w-[92vw] bg-tinta-900 rounded-2xl shadow-alta border border-white/10 overflow-hidden text-white">
              <div className="p-3 bg-white/[0.06] border-b border-white/10 flex items-center justify-between">
                <span className="font-bold">Notificaciones</span>
                {noLeidas > 0 && (
                  <button
                    onClick={marcarTodasLeidas}
                    className="text-xs font-semibold text-white/70 transition-colors hover:text-white"
                  >
                    Marcar leídas
                  </button>
                )}
              </div>

              <div className="max-h-[60vh] overflow-y-auto">
                {historial.length === 0 ? (
                  <div className="p-6 text-center text-white/50 text-sm">
                    No tienes notificaciones todavía.
                  </div>
                ) : (
                  historial.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => alClic(a)}
                      className={`w-full text-left px-4 py-3 border-b border-white/5 last:border-0 flex items-start gap-2 transition-colors hover:bg-white/10 ${
                        a.leido ? 'opacity-55' : ''
                      }`}
                    >
                      <span
                        className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${
                          a.leido ? 'bg-transparent' : 'bg-bandera-rojo'
                        }`}
                      />
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm leading-snug">
                          {a.mensaje}
                        </span>
                        <span className="block text-[11px] text-white/45 mt-0.5">
                          {new Date(a.ts).toLocaleTimeString('es-VE', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </span>
                      {a.accion && (
                        <ChevronRight
                          className="h-4 w-4 shrink-0 text-white/40 mt-1"
                          aria-hidden="true"
                        />
                      )}
                    </button>
                  ))
                )}
              </div>

              {historial.length > 0 && (
                <div className="p-2 border-t border-white/10">
                  <button
                    onClick={limpiar}
                    className="w-full text-center text-xs text-white/50 py-1 transition-colors hover:text-red-300"
                  >
                    Borrar todas
                  </button>
                </div>
              )}
            </div>
          </>,
          document.body,
        )}
    </>
  )
}
