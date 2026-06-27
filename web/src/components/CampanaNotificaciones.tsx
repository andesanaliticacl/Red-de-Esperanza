import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useNotificaciones, type Aviso } from '../context/NotificacionesContext'

/**
 * Campana de notificaciones de la barra superior. Muestra el número de avisos
 * sin leer y, al abrirse, la lista de todo lo recibido en la sesión. Tocar un
 * aviso con acción lleva a la pantalla correspondiente. Para todos los roles.
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
        aria-label="Notificaciones"
        title="Notificaciones"
      >
        <span className="text-lg leading-none">🔔</span>
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
            <div className="fixed right-2 top-16 z-[2500] w-80 max-w-[92vw] bg-white rounded-2xl shadow-2xl border overflow-hidden text-gray-800">
              <div className="p-3 bg-gray-50 border-b flex items-center justify-between">
                <span className="font-bold">Notificaciones</span>
                {historial.length > 0 && (
                  <button
                    onClick={marcarTodasLeidas}
                    className="text-xs text-bandera-azul font-semibold"
                  >
                    Marcar leídas
                  </button>
                )}
              </div>

              <div className="max-h-[60vh] overflow-y-auto">
                {historial.length === 0 ? (
                  <div className="p-6 text-center text-gray-500 text-sm">
                    No tienes notificaciones todavía.
                  </div>
                ) : (
                  historial.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => alClic(a)}
                      className={`w-full text-left px-4 py-3 border-b last:border-0 hover:bg-gray-50 flex gap-2 ${
                        a.leido ? 'opacity-60' : ''
                      }`}
                    >
                      {!a.leido && (
                        <span className="mt-1.5 h-2 w-2 rounded-full bg-bandera-rojo shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm">{a.mensaje}</div>
                        <div className="text-[11px] text-gray-400 mt-0.5">
                          {new Date(a.ts).toLocaleTimeString('es-VE', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                          {a.accion ? ` · ${a.accion.etiqueta} →` : ''}
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>

              {historial.length > 0 && (
                <div className="p-2 border-t">
                  <button
                    onClick={limpiar}
                    className="w-full text-center text-xs text-gray-500 py-1 hover:text-bandera-rojo"
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
