import { Link } from 'react-router-dom'
import {
  Siren,
  Plus,
  Flag,
  UserSearch,
  Package,
  MessageCircle,
  UserRoundPlus,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import Paloma from './Paloma'

/**
 * Bienvenida. Antes era un muro de nueve párrafos largos que nadie iba a leer
 * —menos aún alguien en una emergencia—, así que explicaba mucho y comunicaba
 * poco. Ahora son seis tarjetas de una línea: el objetivo es que en cinco
 * segundos se entienda qué hace la app y cómo pedir o dar ayuda.
 *
 * Los detalles finos (que la ubicación de desaparecidos es aproximada, cómo
 * arrastrar el pin, los filtros) viven donde se usan, que es donde de verdad
 * sirven.
 */
const ACCIONES: {
  icono: LucideIcon
  color: string
  titulo: string
  texto: string
}[] = [
  {
    icono: Siren,
    color: '#CC0001',
    titulo: 'Pide ayuda',
    texto: 'Toca SOS y enviamos tu ubicación a los rescatistas.',
  },
  {
    icono: Plus,
    color: '#002FA7',
    titulo: 'Reporta',
    texto: 'Agua, medicinas, refugio o un peligro, en segundos.',
  },
  {
    icono: Flag,
    color: '#B91C1C',
    titulo: 'Zona sin atender',
    texto: 'Marca áreas donde aún no ha llegado ayuda.',
  },
  {
    icono: UserSearch,
    color: '#15803D',
    titulo: 'Desaparecidos',
    texto: 'Busca personas. La ubicación es aproximada.',
  },
  {
    icono: Package,
    color: '#C2740B',
    titulo: 'Centros de acopio',
    texto: 'Encuentra dónde llevar o enviar ayuda.',
  },
  {
    icono: MessageCircle,
    color: '#6D28D9',
    titulo: 'Chat en vivo',
    texto: 'Coordina con la gente de tu zona.',
  },
]

export default function TutorialModal({ onCerrar }: { onCerrar: () => void }) {
  const { session } = useAuth()

  return (
    <div
      className="fixed inset-0 z-[2200] bg-black/60 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onCerrar}
      role="dialog"
      aria-modal="true"
      aria-labelledby="tutorial-titulo"
    >
      {/* Oscuro a propósito: es una pantalla de bienvenida, no algo que se
          lea al sol. El contenido de trabajo (mapa, formularios) va claro. */}
      <div
        className="relative w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-tinta-900 text-white p-5 shadow-alta"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onCerrar}
          className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full bg-white/10 text-white/80 transition-colors hover:bg-white/20 hover:text-white"
          aria-label="Cerrar"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-2 text-white/70">
          <Paloma className="h-5 w-5" />
          <span className="text-sm font-semibold">¡Bienvenido!</span>
        </div>
        <h2
          id="tutorial-titulo"
          className="mt-1 text-2xl sm:text-3xl font-extrabold tracking-tight"
        >
          Juntos, salvamos vidas.
        </h2>
        <p className="mt-2 text-sm leading-snug text-white/70">
          Usa el mapa para ver necesidades, pide ayuda o reporta lo que está
          pasando.
        </p>

        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-2">
          {ACCIONES.map((a) => (
            <div
              key={a.titulo}
              className="rounded-2xl bg-white/[0.06] border border-white/10 p-3 text-center"
            >
              <span
                className="mx-auto grid h-10 w-10 place-items-center rounded-full"
                style={{ backgroundColor: a.color }}
              >
                <a.icono className="h-5 w-5 text-white" aria-hidden="true" />
              </span>
              <div className="mt-2 text-sm font-bold leading-tight">
                {a.titulo}
              </div>
              <div className="mt-1 text-[11px] leading-snug text-white/60">
                {a.texto}
              </div>
            </div>
          ))}
        </div>


        {/* Con sesión iniciada, ofrecer "crear cuenta" no tiene sentido. */}
        {session ? (
          <button onClick={onCerrar} className="btn-azul w-full mt-3">
            Empezar
          </button>
        ) : (
          <>
            <Link
              to="/registro?rol=voluntario"
              onClick={onCerrar}
              className="btn-rojo w-full mt-3 no-underline"
            >
              <UserRoundPlus className="h-5 w-5 shrink-0" aria-hidden="true" />
              <span className="flex flex-col items-start leading-tight">
                <span>Crear cuenta / Iniciar sesión</span>
                <span className="text-[11px] font-normal opacity-90">
                  Elige tu rol y empieza a ayudar
                </span>
              </span>
            </Link>
            <button
              onClick={onCerrar}
              className="w-full mt-1.5 py-1.5 text-sm font-semibold text-white/60 transition-colors hover:text-white"
            >
              Ahora no, ver el mapa
            </button>
          </>
        )}
      </div>
    </div>
  )
}
