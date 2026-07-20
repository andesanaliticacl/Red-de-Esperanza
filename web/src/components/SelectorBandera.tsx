import { useLayoutEffect, useRef, useState } from 'react'
import Bandera from './Bandera'

export interface OpcionBandera {
  value: string
  iso: string
  etiqueta: string
  /** Etiqueta compacta para mostrar cuando el selector está cerrado. */
  etiquetaCorta?: string
}

// Atajo: sin escribir nada, el panel muestra solo estos países (los dos
// donde opera la red) en vez de la lista completa de ~190. En el teléfono,
// desplazarse por la lista entera para llegar a "Venezuela" o "Chile" era
// muy incómodo. Escribir sigue buscando en TODOS los países normalmente.
const ISO_DESTACADOS = ['ve', 'cl']

/**
 * Dropdown personalizado que muestra banderas como imágenes (a diferencia de un
 * <select> nativo, que en Windows no puede mostrar imágenes en las opciones).
 *
 * El panel se posiciona con `position: fixed` anclado al botón, para que NO lo
 * recorte el modal con scroll donde suele vivir. Incluye un buscador (la lista
 * de países es larga) y se abre hacia arriba o hacia abajo según el espacio.
 */
export default function SelectorBandera({
  opciones,
  valor,
  onChange,
  placeholder = 'Elige…',
  className = '',
}: {
  opciones: OpcionBandera[]
  valor: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}) {
  const [abierto, setAbierto] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const btnRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{
    left: number
    width: number
    top?: number
    bottom?: number
  } | null>(null)

  const sel = opciones.find((o) => o.value === valor)

  // Calcula la posición del panel (fija, anclada al botón). Decide arriba/abajo
  // según dónde haya más espacio.
  function calcularPos() {
    const b = btnRef.current
    if (!b) return
    const r = b.getBoundingClientRect()
    const ancho = Math.max(r.width, 240)
    const left = Math.min(r.left, window.innerWidth - ancho - 8)
    const abajo = window.innerHeight - r.bottom
    if (abajo < 280 && r.top > abajo) {
      // Poco espacio abajo → abrir hacia ARRIBA.
      setPos({ left, width: ancho, bottom: window.innerHeight - r.top + 4 })
    } else {
      setPos({ left, width: ancho, top: r.bottom + 4 })
    }
  }

  useLayoutEffect(() => {
    if (abierto) calcularPos()
  }, [abierto])

  // No cerramos por scroll ni por resize: en móvil, el scroll con inercia y el
  // teclado (que dispara "resize") cerraban el menú sin querer. El fondo
  // (backdrop) ya bloquea el desplazamiento de atrás; el menú solo se cierra al
  // tocar fuera o al elegir un país.

  const q = busqueda.trim().toLowerCase()
  const filtradas = q
    ? opciones.filter(
        (o) =>
          o.etiqueta.toLowerCase().includes(q) ||
          o.value.toLowerCase().includes(q),
      )
    : opciones.filter((o) => ISO_DESTACADOS.includes(o.iso))
  const sinBusqueda = !q

  function abrir() {
    setBusqueda('')
    setAbierto(true)
  }

  return (
    <div className={`relative ${className}`}>
      <button
        ref={btnRef}
        type="button"
        onClick={() => (abierto ? setAbierto(false) : abrir())}
        className="input flex items-center gap-2 text-left"
      >
        {sel ? (
          <>
            <Bandera iso={sel.iso} />
            <span className="truncate">{sel.etiquetaCorta ?? sel.etiqueta}</span>
          </>
        ) : (
          <span className="text-gray-400">{placeholder}</span>
        )}
        <span className="ml-auto text-xs text-gray-400">▾</span>
      </button>

      {abierto && pos && (
        <>
          <div
            className="fixed inset-0 z-[2400]"
            onClick={() => setAbierto(false)}
          />
          <div
            ref={panelRef}
            className="fixed z-[2500] bg-white border rounded-xl shadow-xl flex flex-col overflow-hidden"
            style={{
              left: pos.left,
              width: pos.width,
              top: pos.top,
              bottom: pos.bottom,
              maxHeight: 280,
            }}
          >
            <div className="p-2 border-b">
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar país…"
                className="w-full rounded-lg border px-2 py-1.5 text-sm"
              />
            </div>
            <ul className="overflow-y-auto py-1">
              {sinBusqueda && (
                <li className="px-3 pt-1.5 pb-1 text-[11px] text-gray-400">
                  Escribe para buscar otro país
                </li>
              )}
              {filtradas.length === 0 ? (
                <li className="px-3 py-2 text-sm text-gray-400">
                  Sin coincidencias
                </li>
              ) : (
                filtradas.map((o) => (
                  <li key={o.value + o.iso}>
                    <button
                      type="button"
                      onClick={() => {
                        onChange(o.value)
                        setAbierto(false)
                      }}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-50 ${
                        o.value === valor ? 'bg-bandera-azul/10 font-semibold' : ''
                      }`}
                    >
                      <Bandera iso={o.iso} />
                      <span className="truncate">{o.etiqueta}</span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
        </>
      )}
    </div>
  )
}
