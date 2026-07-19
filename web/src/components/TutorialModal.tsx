/** Instructivo súper simple de cómo funciona la app + mensaje de esperanza. */
export default function TutorialModal({ onCerrar }: { onCerrar: () => void }) {
  const pasos = [
    { emoji: '🗺️', t: 'Mira el mapa', d: 'Cada marcador es una necesidad de ayuda. Los marcadores grandes son emergencias dentro de Venezuela; tócalos para ver el detalle.' },
    { emoji: '🆘', t: '¿Emergencia?', d: 'Toca el botón rojo SOS y enviamos tu ubicación a los rescatistas al instante.' },
    { emoji: '➕', t: 'Reporta una necesidad', d: 'Agua, medicinas, refugio, un edificio derrumbado, una inundación, un incendio… En una sola pantalla: busca la dirección (Google Maps) y arrastra el pin al punto exacto. Ya no solo en Venezuela: la red es global.' },
    { emoji: '🚩', t: 'Zona sin atender', d: 'Marca una ZONA donde aún no ha llegado ayuda. Se ve como un círculo rojo, para que rescatistas y voluntarios sepan a dónde ir.' },
    { emoji: '🔍', t: 'Personas desaparecidas', d: 'Activa la capa 🔍 Desaparecidos para verlas y buscarlas por nombre. ⚠️ Su ubicación es APROXIMADA (a nivel de ciudad/zona): es una referencia y puede fallar, no es exacta.' },
    { emoji: '🎚️', t: 'Filtra', d: 'Filtra por tipo (rescate, agua, medicinas, refugio, derrumbe, zona, centros de acopio, hospitales…) y por urgencia, para ver solo lo que te interesa.' },
    { emoji: '📦', t: 'Centros de acopio', d: 'En “Acopios” encuentras dónde llevar o enviar ayuda, con su bandera por país. Los de Venezuela se ven más grandes; los de la diáspora (otros países) más pequeños.' },
    { emoji: '💬', t: 'Conversa', d: 'Usa el chat en vivo para coordinar con la gente de tu país y tu estado o región (Venezuela, Chile…).' },
    { emoji: '🤝', t: '¿Quieres ayudar?', d: 'Crea una cuenta y elige tu rol (voluntario, rescatista…) para atender casos.' },
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
