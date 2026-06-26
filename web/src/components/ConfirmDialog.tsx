/** Diálogo de confirmación estético, a juego con la app (reemplaza confirm()). */
export default function ConfirmDialog({
  abierto,
  titulo,
  mensaje,
  emoji = '❓',
  textoConfirmar = 'Confirmar',
  textoCancelar = 'Cancelar',
  peligro = false,
  onConfirmar,
  onCancelar,
}: {
  abierto: boolean
  titulo: string
  mensaje?: string
  emoji?: string
  textoConfirmar?: string
  textoCancelar?: string
  peligro?: boolean
  onConfirmar: () => void
  onCancelar: () => void
}) {
  if (!abierto) return null
  return (
    <div
      className="fixed inset-0 z-[2700] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onCancelar}
    >
      <div
        className="bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl p-6 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-4xl mb-2">{emoji}</div>
        <h2 className="text-xl font-extrabold text-bandera-azul mb-1">
          {titulo}
        </h2>
        {mensaje && <p className="text-gray-600 mb-5 text-sm">{mensaje}</p>}
        <div className="flex gap-2">
          <button onClick={onCancelar} className="btn-gris flex-1">
            {textoCancelar}
          </button>
          <button
            onClick={onConfirmar}
            className={`${peligro ? 'btn-rojo' : 'btn-azul'} flex-1`}
          >
            {textoConfirmar}
          </button>
        </div>
      </div>
    </div>
  )
}
