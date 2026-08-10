import { Heart, Ambulance, Package, ShieldCheck, Compass } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

/**
 * Explicación de las opciones del registro, para ayudar a elegir.
 *
 * Sigue EXACTAMENTE las cuatro tarjetas de "¿Cómo quieres participar?": si
 * la lista de aquí no calza con la de allá, el modal confunde en vez de
 * ayudar. Por eso psicólogo/a ya no va suelto — vive dentro de "entidad o
 * profesional", igual que en el formulario.
 *
 * Una línea por opción, para que entre sin desplazar.
 */
const OPCIONES: { icono: LucideIcon; t: string; d: string }[] = [
  {
    icono: Heart,
    t: 'Voluntario',
    d: 'Atiendes necesidades (agua, comida, medicinas, refugio) y coordinas la ayuda.',
  },
  {
    icono: Ambulance,
    t: 'Rescatista',
    d: 'Como el voluntario, pero para emergencias: el SOS te suena fuerte para responder de inmediato.',
  },
  {
    icono: Package,
    t: 'Centro de acopio',
    d: 'Gestionas un punto de donaciones y la gente ve dónde llevar la ayuda.',
  },
  {
    icono: ShieldCheck,
    t: 'Entidad o profesional',
    d: 'Bomberos, municipalidad, rescate, ONG, junta vecinal, empresa — o tu profesión (psicólogo/a, veterinario/a…). El equipo verifica antes de publicar.',
  },
]

export default function RolesInfoModal({ onCerrar }: { onCerrar: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[2300] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onCerrar}
    >
      <div
        className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="flex items-center gap-2 text-lg font-extrabold text-bandera-azul">
            <Compass className="h-5 w-5 shrink-0" aria-hidden="true" />
            ¿Qué opción elegir?
          </h2>
          <button
            onClick={onCerrar}
            className="text-2xl text-gray-400 leading-none"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        <p className="rounded-xl bg-bandera-azul/5 p-2.5 text-xs leading-snug text-tinta-600 mb-3">
          <b>Todos</b>, con o sin cuenta, pueden ver el mapa, enviar un{' '}
          <b>SOS</b>, reportar y usar el chat. Esto solo cambia qué avisos
          recibes y qué puedes gestionar.
        </p>

        <div className="space-y-2.5">
          {OPCIONES.map((o) => (
            <div key={o.t} className="flex items-start gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-tinta-50 text-tinta-600">
                <o.icono className="h-4.5 w-4.5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <div className="text-sm font-bold text-tinta-800 leading-tight">
                  {o.t}
                </div>
                <div className="text-xs text-tinta-500 leading-snug">{o.d}</div>
              </div>
            </div>
          ))}
        </div>

        <button onClick={onCerrar} className="btn-azul w-full mt-4 py-2.5">
          Entendido
        </button>
      </div>
    </div>
  )
}
