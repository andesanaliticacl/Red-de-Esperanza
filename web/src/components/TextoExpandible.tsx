import { useState } from 'react'

/**
 * Muestra un texto (descripción / título de una necesidad) recortado a una línea
 * y, si es largo, ofrece un botón "Ver completo" para desplegarlo entero. Resuelve
 * el caso de títulos muy largos que no se alcanzaban a leer en las listas.
 */
export default function TextoExpandible({
  texto,
  className = '',
  umbral = 45,
}: {
  texto: string
  className?: string
  /** A partir de cuántos caracteres se ofrece el botón "Ver completo". */
  umbral?: number
}) {
  const [verTodo, setVerTodo] = useState(false)
  const esLargo = (texto?.length ?? 0) > umbral
  return (
    <>
      <div
        className={`${className} ${
          verTodo ? 'whitespace-pre-wrap break-words' : 'truncate'
        }`}
      >
        {texto}
      </div>
      {esLargo && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            setVerTodo((v) => !v)
          }}
          className="text-xs font-semibold text-bandera-azul mt-0.5"
        >
          {verTodo ? 'Ver menos ▲' : 'Ver completo ▼'}
        </button>
      )}
    </>
  )
}
