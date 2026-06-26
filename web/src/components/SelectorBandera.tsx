import { useState } from 'react'
import Bandera from './Bandera'

export interface OpcionBandera {
  value: string
  iso: string
  etiqueta: string
  /** Etiqueta compacta para mostrar cuando el selector está cerrado. */
  etiquetaCorta?: string
}

/**
 * Dropdown personalizado que muestra banderas como imágenes (a diferencia de un
 * <select> nativo, que en Windows no puede mostrar imágenes en las opciones).
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
  const sel = opciones.find((o) => o.value === valor)

  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
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

      {abierto && (
        <>
          <div
            className="fixed inset-0 z-[2400]"
            onClick={() => setAbierto(false)}
          />
          <ul className="absolute z-[2500] mt-1 w-max min-w-full max-w-[85vw] max-h-64 overflow-y-auto bg-white border rounded-xl shadow-xl py-1">
            {opciones.map((o) => (
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
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
