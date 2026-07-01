import { useEffect, useRef, useState } from 'react'

/**
 * Muestra un texto recortado a una linea y ofrece "Ver mas" solo cuando
 * realmente queda oculto por falta de espacio.
 */
export default function TextoExpandible({
  texto,
  className = '',
}: {
  texto: string
  className?: string
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [verTodo, setVerTodo] = useState(false)
  const [puedeExpandir, setPuedeExpandir] = useState(false)

  useEffect(() => {
    setVerTodo(false)
  }, [texto])

  useEffect(() => {
    if (verTodo) return
    const el = ref.current
    if (!el) return

    function medir() {
      const actual = ref.current
      if (!actual) return
      setPuedeExpandir(actual.scrollWidth > actual.clientWidth + 1)
    }

    medir()
    const observer =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(medir) : null
    observer?.observe(el)
    window.addEventListener('resize', medir)

    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', medir)
    }
  }, [texto, verTodo])

  return (
    <>
      <div
        ref={ref}
        className={`${className} ${
          verTodo ? 'whitespace-pre-wrap break-words' : 'truncate'
        }`}
      >
        {texto}
      </div>
      {(puedeExpandir || verTodo) && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            setVerTodo((v) => !v)
          }}
          className="text-xs font-semibold text-bandera-azul mt-0.5"
          aria-expanded={verTodo}
        >
          {verTodo ? 'Ver menos' : 'Ver más'}
        </button>
      )}
    </>
  )
}
