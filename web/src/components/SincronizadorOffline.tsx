import { useEffect, useRef, useState } from 'react'
import { useNotificaciones } from '../context/NotificacionesContext'
import { sincronizarCola } from '../lib/reportes'
import { contarEnCola, EVENTO_COLA } from '../lib/colaOffline'

/**
 * Motor offline: vacía la cola de reportes creados sin Internet en cuanto vuelve
 * la conexión (y al abrir la app), avisa al usuario y muestra una pastilla con
 * cuántos reportes quedan pendientes de enviar. No pinta nada si no hay pendientes.
 */
export default function SincronizadorOffline() {
  const { notificar } = useNotificaciones()
  const [pendientes, setPendientes] = useState(0)
  const sincronizando = useRef(false)

  // Contador de pendientes siempre al día (se actualiza al cambiar la cola).
  useEffect(() => {
    const refrescar = () => setPendientes(contarEnCola())
    refrescar()
    window.addEventListener(EVENTO_COLA, refrescar)
    return () => window.removeEventListener(EVENTO_COLA, refrescar)
  }, [])

  useEffect(() => {
    async function sincronizar(avisar: boolean) {
      if (sincronizando.current || !navigator.onLine || contarEnCola() === 0)
        return
      sincronizando.current = true
      const enviados = await sincronizarCola()
      sincronizando.current = false
      if (avisar && enviados > 0) {
        notificar(
          `✅ Conexión recuperada: enviamos ${enviados} ${
            enviados === 1 ? 'reporte guardado' : 'reportes guardados'
          } sin Internet.`,
          'exito',
        )
      }
    }

    // Al abrir la app: intentamos vaciar la cola en silencio.
    void sincronizar(false)

    const alReconectar = () => void sincronizar(true)
    const alDesconectar = () =>
      notificar(
        '📴 Sin Internet. Puedes seguir reportando: se enviará solo al reconectar.',
        'alerta',
      )
    window.addEventListener('online', alReconectar)
    window.addEventListener('offline', alDesconectar)
    return () => {
      window.removeEventListener('online', alReconectar)
      window.removeEventListener('offline', alDesconectar)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (pendientes === 0) return null
  return (
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[1500] pointer-events-none">
      <div className="pointer-events-auto rounded-full bg-amber-500 text-white text-xs font-bold px-3 py-1.5 shadow-lg flex items-center gap-1.5">
        <span className="animate-pulse">📴</span>
        {pendientes} {pendientes === 1 ? 'reporte pendiente' : 'reportes pendientes'}{' '}
        de enviar
      </div>
    </div>
  )
}
