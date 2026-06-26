/** Explicación de los roles, para ayudar a elegir al registrarse. */
export default function RolesInfoModal({ onCerrar }: { onCerrar: () => void }) {
  const roles = [
    {
      emoji: '🙋',
      t: 'Ciudadano',
      d: 'Visualizas y reportas. Ves el mapa y las ubicaciones, pides ayuda con un SOS y reportas necesidades. NO recibes alertas ni notificaciones: solo observas lo que pasa a tu alrededor.',
    },
    {
      emoji: '🤝',
      t: 'Voluntario',
      d: 'Atiendes y coordinas necesidades (agua, comida, medicinas, refugio). Te asignas casos y recibes un aviso cuando alguien te escribe. Eres el apoyo logístico de la red.',
    },
    {
      emoji: '🚑',
      t: 'Rescatista',
      d: 'Como el voluntario, pero enfocado en EMERGENCIAS y rescates. Cuando alguien presiona SOS, te suena una alarma fuerte para responder de inmediato a situaciones de vida o muerte.',
    },
    {
      emoji: '📦',
      t: 'Centro de acopio',
      d: 'Registras y gestionas tu centro de donaciones. La gente ve dónde llevar o enviar ayuda y puede comunicarse contigo para coordinar.',
    },
  ]

  return (
    <div
      className="fixed inset-0 z-[2300] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onCerrar}
    >
      <div
        className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-6 max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-extrabold text-bandera-azul">
            🧭 ¿Qué rol elegir?
          </h2>
          <button
            onClick={onCerrar}
            className="text-2xl text-gray-400 leading-none"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        <div className="rounded-2xl bg-bandera-azul/5 p-3 text-sm text-gray-700 mb-4">
          <b>Todos</b> (con o sin cuenta) pueden ver el mapa y las ubicaciones,
          enviar un <b>SOS</b>, reportar necesidades, ver los <b>centros de
          acopio</b> y usar el <b>chat</b>. La diferencia está en las alertas y
          en qué puedes gestionar:
        </div>

        <div className="space-y-3">
          {roles.map((r) => (
            <div key={r.t} className="flex items-start gap-3">
              <span className="text-2xl">{r.emoji}</span>
              <div>
                <div className="font-bold">{r.t}</div>
                <div className="text-sm text-gray-600">{r.d}</div>
              </div>
            </div>
          ))}
        </div>

        <button onClick={onCerrar} className="btn-azul w-full mt-5">
          Entendido
        </button>
      </div>
    </div>
  )
}
