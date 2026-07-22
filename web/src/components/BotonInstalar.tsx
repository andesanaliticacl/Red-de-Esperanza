import { useEffect, useState } from 'react'

// El evento `beforeinstallprompt` no está tipado en el DOM estándar. Lo dispara
// Chrome/Android (y Edge). En iOS NO existe: allí la instalación es manual desde
// Compartir → "Agregar a inicio", así que para iPhone mostramos instrucciones.
interface PromptInstalacion extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const CLAVE_INSTALADA = 'esperanza.appInstalada'

/** ¿Ya está abierta como app instalada (pantalla completa)? */
function esModoApp(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

/** ¿Es un dispositivo iOS (iPhone/iPad)? El iPad moderno se reporta como Mac. */
function esIOS(): boolean {
  const ua = navigator.userAgent
  return (
    /iphone|ipad|ipod/i.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

/**
 * Botón "Instalar app" para usar la app como aplicación y sin Internet (PWA).
 *  · Android/Chrome: abre el instalador nativo (evento beforeinstallprompt).
 *  · iPhone/iPad: muestra las instrucciones para "Agregar a inicio" (iOS no
 *    permite instalación automática).
 * Desaparece PARA SIEMPRE al instalar (modo app + marca local).
 */
export default function BotonInstalar() {
  const [evento, setEvento] = useState<PromptInstalacion | null>(null)
  const [oculto, setOculto] = useState(false)
  const [verInstruccionesIOS, setVerInstruccionesIOS] = useState(false)
  const ios = esIOS()

  useEffect(() => {
    if (esModoApp() || localStorage.getItem(CLAVE_INSTALADA) === '1') {
      setOculto(true)
      return
    }
    const alOfrecer = (e: Event) => {
      e.preventDefault() // usamos NUESTRO botón, no el mini-cartel del navegador
      setEvento(e as PromptInstalacion)
    }
    const alInstalar = () => {
      localStorage.setItem(CLAVE_INSTALADA, '1')
      setOculto(true)
      setEvento(null)
    }
    window.addEventListener('beforeinstallprompt', alOfrecer)
    window.addEventListener('appinstalled', alInstalar)
    return () => {
      window.removeEventListener('beforeinstallprompt', alOfrecer)
      window.removeEventListener('appinstalled', alInstalar)
    }
  }, [])

  // Mostramos el botón si: Android nos dio el evento, o es iOS (instrucciones).
  const mostrar = !oculto && (evento !== null || ios)
  if (!mostrar) return null

  async function instalar() {
    // iOS: no hay instalador programático → instrucciones.
    if (evento === null && ios) {
      setVerInstruccionesIOS(true)
      return
    }
    if (!evento) return
    await evento.prompt()
    const { outcome } = await evento.userChoice
    if (outcome === 'accepted') {
      localStorage.setItem(CLAVE_INSTALADA, '1')
      setOculto(true)
    }
    setEvento(null)
  }

  return (
    <>
      <button
        onClick={instalar}
        className="bg-green-600 text-white rounded-full shadow-lg border border-green-700 pl-2.5 pr-3.5 h-11 flex items-center gap-2 hover:bg-green-700 active:scale-95 transition"
        title="Instalar la app para usarla sin Internet"
        aria-label="Instalar la app para usarla sin Internet"
      >
        <span className="text-lg leading-none">📲</span>
        <span className="flex flex-col leading-tight text-left">
          <span className="text-xs sm:text-sm font-bold">Instalar app</span>
          <span className="text-[10px] font-normal opacity-90">
            Úsala sin Internet
          </span>
        </span>
      </button>

      {/* Instrucciones para iPhone/iPad (instalación manual). */}
      {verInstruccionesIOS && (
        <div
          className="fixed inset-0 z-[3000] bg-black/60 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setVerInstruccionesIOS(false)}
        >
          <div
            className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-extrabold text-bandera-azul">
                📲 Instalar en iPhone
              </h2>
              <button
                onClick={() => setVerInstruccionesIOS(false)}
                className="text-2xl text-gray-400 leading-none"
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              En iPhone/iPad la instalación es en 2 pasos, desde{' '}
              <b>Safari</b>:
            </p>
            <ol className="space-y-3 text-sm text-gray-800">
              <li className="flex items-start gap-3">
                <span className="shrink-0 h-6 w-6 rounded-full bg-bandera-azul text-white grid place-items-center text-xs font-bold">
                  1
                </span>
                <span>
                  Toca el botón <b>Compartir</b>{' '}
                  <span className="inline-block align-middle">⎙</span> (el
                  cuadrito con la flecha hacia arriba, abajo en la barra).
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="shrink-0 h-6 w-6 rounded-full bg-bandera-azul text-white grid place-items-center text-xs font-bold">
                  2
                </span>
                <span>
                  Baja y toca <b>“Agregar a inicio”</b>{' '}
                  <span className="inline-block align-middle">➕</span>, luego{' '}
                  <b>Agregar</b>.
                </span>
              </li>
            </ol>
            <p className="text-xs text-gray-500 mt-4">
              Listo: quedará como una app en tu pantalla de inicio y podrás usarla
              sin Internet.
            </p>
            <button
              onClick={() => setVerInstruccionesIOS(false)}
              className="mt-4 w-full py-3 rounded-2xl font-bold bg-bandera-azul text-white"
            >
              Entendido
            </button>
          </div>
        </div>
      )}
    </>
  )
}
