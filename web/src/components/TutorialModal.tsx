/** Instructivo súper simple de cómo funciona la app + mensaje de esperanza. */
export default function TutorialModal({ onCerrar }: { onCerrar: () => void }) {
  const pasos = [
    { emoji: '🗺️', t: 'Mira el mapa', d: 'Cada marcador es alguien que necesita ayuda cerca de ti.' },
    { emoji: '🆘', t: '¿Emergencia?', d: 'Toca SOS y enviamos tu ubicación a los rescatistas al instante.' },
    { emoji: '➕', t: 'Reporta', d: 'Avisa de una necesidad (agua, medicinas, un derrumbe…) en un toque.' },
    { emoji: '💬', t: 'Conversa', d: 'Usa el chat en vivo para coordinar con la gente de tu ciudad.' },
  ]

  return (
    <div
      className="fixed inset-0 z-[2200] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onCerrar}
    >
      <div
        className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-6 max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-extrabold text-bandera-azul">
            🕊️ ¿Cómo funciona?
          </h2>
          <button
            onClick={onCerrar}
            className="text-2xl text-gray-400 leading-none"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        <div className="space-y-3">
          {pasos.map((p) => (
            <div key={p.t} className="flex items-start gap-3">
              <span className="text-2xl">{p.emoji}</span>
              <div>
                <div className="font-bold">{p.t}</div>
                <div className="text-sm text-gray-600">{p.d}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-2xl bg-bandera-azul/5 p-4 text-center">
          <p className="text-gray-700 italic">
            “Ningún gesto de ayuda es pequeño. Juntos, cada reporte acerca a una
            familia a reencontrarse. No estás solo: esta red existe por ti. 💙”
          </p>
          <p className="mt-2 text-sm font-semibold text-bandera-azul">
            — De parte del equipo desarrollador
          </p>
        </div>

        <button onClick={onCerrar} className="btn-azul w-full mt-5">
          Entendido, empezar
        </button>
      </div>
    </div>
  )
}
