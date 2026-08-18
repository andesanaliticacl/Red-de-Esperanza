import { useEffect, useState } from 'react'
import { useMovimientos, type Movimiento } from '../hooks/useMovimientos'

/**
 * Registro en vivo: lo último que va pasando, abajo del mapa.
 *
 * Reglas de espacio, porque esto vive ENCIMA del mapa y el mapa es lo que la
 * gente vino a ver:
 *  · UNA línea por movimiento. Si no cabe, se corta con puntos suspensivos.
 *  · Sin scroll interno: son tres como máximo y se acabó.
 *  · Es un TITULAR, no el artículo. El detalle está en el marcador, y para
 *    eso tocarlo lleva hasta allá.
 *  · Se puede ocultar. Nada que tape el mapa debe ser obligatorio.
 */
// Se CARGAN 5 al abrir pero se MUESTRAN 3. Medido a 320 px: con cinco
// filas, la tira mas los botones ocupaban 296 px, el 52 % de la pantalla, y
// al mapa le quedaban 277. Con tres baja a 232 px y el mapa recupera 64.
// Las otras dos siguen en memoria y aparecen a medida que las de arriba
// envejecen.
const VISIBLES = 3

/**
 * Desde que la tira carga las últimas al abrir, hay líneas de hace horas o
 * días. Se dice con todas sus letras ("hace 2d") para que ninguna aparente
 * ser más reciente de lo que es: una tira que insinúa actividad que no hubo
 * desinforma justo cuando más caro sale.
 */
function hace(ms: number): string {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000))
  if (s < 60) return `hace ${s}s`
  const m = Math.round(s / 60)
  if (m < 60) return `hace ${m}m`
  const h = Math.round(m / 60)
  if (h < 24) return `hace ${h}h`
  return `hace ${Math.round(h / 24)}d`
}

export default function RegistroEnVivo({
  onIr,
}: {
  /** Lleva el mapa al marcador del movimiento tocado. */
  onIr: (m: Movimiento) => void
}) {
  const movimientos = useMovimientos()
  // Arranca COLAPSADO: desplegado ocupaba cuatro renglones bajo el logo y le
  // quitaba sitio a los filtros. Como pastilla es una línea, y quien no
  // necesita el detalle ni la nota. El que quiera mirar, la toca.
  const [oculto, setOculto] = useState(true)
  // Solo para que los "hace Xs" se refresquen sin depender de que llegue
  // otro movimiento.
  const [, setTic] = useState(0)

  useEffect(() => {
    const id = window.setInterval(() => setTic((t) => t + 1), 15_000)
    return () => window.clearInterval(id)
  }, [])

  if (movimientos.length === 0) return null

  if (oculto) {
    return (
      <div className="pointer-events-auto flex justify-center">
        <button
          onClick={() => setOculto(false)}
          className="rounded-full bg-white/95 backdrop-blur shadow px-3 py-1 text-[11px] font-bold text-gray-600"
        >
          🔴 En vivo ({movimientos.length})
        </button>
      </div>
    )
  }

  return (
    <div className="pointer-events-auto bg-white/95 backdrop-blur rounded-2xl shadow p-1.5">
      <div className="flex items-center justify-between px-1 pb-1">
        <span className="text-[10px] font-bold text-gray-500 flex items-center gap-1">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
          EN VIVO
        </span>
        <button
          onClick={() => setOculto(true)}
          className="text-[10px] font-bold text-gray-400 px-1"
          aria-label="Ocultar registro en vivo"
        >
          Ocultar
        </button>
      </div>
      <ul className="space-y-1">
        {movimientos.slice(0, VISIBLES).map((m) => {
          // Sin coordenadas no hay a dónde ir (pasa con las ofertas de tipo
          // comunidad): se muestra igual, pero no se ofrece como enlace.
          const irPosible = m.lat != null && m.lng != null
          const Etiqueta = irPosible ? 'button' : 'div'
          return (
            <li key={`${m.clase}-${m.id}`}>
              <Etiqueta
                {...(irPosible ? { onClick: () => onIr(m) } : {})}
                className={`w-full flex items-center gap-1.5 rounded-lg px-1.5 py-1 text-left ${
                  irPosible ? 'hover:bg-gray-100 active:bg-gray-200' : ''
                }`}
              >
                <span className="text-sm shrink-0" aria-hidden="true">
                  {m.emoji}
                </span>
                {/* min-w-0 + truncate: una sola línea SIEMPRE, aunque la zona
                    venga con un nombre larguísimo o sin espacios. */}
                <span className="min-w-0 flex-1 truncate text-[11px]">
                  <strong className="font-bold">
                    {m.clase === 'oferta' ? 'Ofrecen' : 'Piden'} {m.etiqueta}
                  </strong>
                  {m.zona ? ` · ${m.zona}` : ''}
                </span>
                <span className="shrink-0 text-[10px] text-gray-400">
                  {hace(m.en)}
                </span>
              </Etiqueta>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
