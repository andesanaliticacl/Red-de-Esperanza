import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { TIPO_META, type Necesidad } from '../lib/types'

const FMT: Intl.DateTimeFormatOptions = {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
}

/** Historial del usuario: lo que reportó y lo que atendió (si es personal). */
export default function HistorialView() {
  const { perfil, rol } = useAuth()
  const [mios, setMios] = useState<Necesidad[]>([])
  const [atendidos, setAtendidos] = useState<Necesidad[]>([])
  const [cargando, setCargando] = useState(true)

  const esStaff =
    rol === 'voluntario' ||
    rol === 'rescatista' ||
    rol === 'lider_voluntarios' ||
    rol === 'verificador' ||
    rol === 'admin'

  useEffect(() => {
    if (!perfil?.id) return
    async function cargar() {
      const consultas = [
        supabase
          .from('necesidades')
          .select(
            'id, tipo, urgencia, estado, descripcion, zona, lat, lng, origen, reportado_por, asignado_a, creado_en',
          )
          .eq('reportado_por', perfil!.id)
          .order('creado_en', { ascending: false }),
        esStaff
          ? supabase
              .from('necesidades')
              .select('*')
              .eq('asignado_a', perfil!.id)
              .order('actualizado_en', { ascending: false })
          : Promise.resolve({ data: [] as Necesidad[] }),
      ]
      const [r1, r2] = await Promise.all(consultas)
      setMios((r1.data ?? []) as Necesidad[])
      setAtendidos((r2.data ?? []) as Necesidad[])
      setCargando(false)
    }
    cargar()
  }, [perfil?.id, esStaff])

  // De lo atendido, separamos SOS/rescates del resto.
  const sosAtendidos = atendidos.filter(
    (n) => n.tipo === 'rescate' || n.origen === 'sos',
  )
  const necAtendidas = atendidos.filter(
    (n) => !(n.tipo === 'rescate' || n.origen === 'sos'),
  )

  if (cargando) {
    return (
      <div className="max-w-2xl mx-auto p-4">
        <div className="card text-center text-gray-500 py-8">Cargando…</div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-5">
      <h1 className="text-2xl font-extrabold text-bandera-azul">
        Mi historial de actividad
      </h1>
      <p className="text-gray-600 text-sm">
        Aquí queda registrado todo lo que has hecho en la plataforma: las
        necesidades y SOS que reportaste{esStaff ? ', y los casos que atendiste como parte del equipo' : ''}.
      </p>

      <Seccion
        titulo="Necesidades y SOS que reporté"
        emoji="📋"
        lista={mios}
        vacio="Aún no has enviado reportes con tu cuenta."
      />

      {esStaff && (
        <>
          <Seccion
            titulo="SOS atendidos"
            emoji="🆘"
            lista={sosAtendidos}
            vacio="Todavía no has atendido emergencias SOS."
          />
          <Seccion
            titulo="Necesidades atendidas"
            emoji="🤝"
            lista={necAtendidas}
            vacio="Todavía no te has asignado necesidades."
          />
        </>
      )}

      <Link
        to="/"
        className="block text-center text-bandera-azul font-semibold text-sm"
      >
        ← Volver al mapa
      </Link>
    </div>
  )
}

function Seccion({
  titulo,
  emoji,
  lista,
  vacio,
}: {
  titulo: string
  emoji: string
  lista: Necesidad[]
  vacio: string
}) {
  return (
    <section className="space-y-2">
      <h2 className="font-bold text-lg flex items-center gap-2">
        <span>{emoji}</span>
        {titulo}
        <span className="text-sm font-normal text-gray-400">
          ({lista.length})
        </span>
      </h2>
      {lista.length === 0 ? (
        <div className="card text-center text-gray-400 text-sm py-5">{vacio}</div>
      ) : (
        <div className="space-y-2">
          {lista.map((n) => (
            <div key={n.id} className="card flex items-center gap-3 py-3">
              <span className="text-2xl">{TIPO_META[n.tipo].emoji}</span>
              <div className="flex-1 min-w-0">
                <div className="font-semibold truncate">{n.descripcion}</div>
                <div className="text-xs text-gray-500">
                  {n.zona ? `📍 ${n.zona} · ` : ''}
                  {new Date(n.creado_en).toLocaleString('es-VE', FMT)}
                </div>
              </div>
              <EstadoChip estado={n.estado} />
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function EstadoChip({ estado }: { estado: Necesidad['estado'] }) {
  const meta: Record<Necesidad['estado'], { t: string; c: string }> = {
    sin_verificar: { t: 'Recibido', c: 'bg-gray-100 text-gray-600' },
    verificada: { t: 'Recibido', c: 'bg-gray-100 text-gray-600' },
    en_proceso: { t: 'En proceso', c: 'bg-blue-100 text-blue-700' },
    resuelta: { t: 'Atendido', c: 'bg-green-100 text-green-700' },
    rechazada: { t: 'Cerrado', c: 'bg-red-100 text-red-700' },
  }
  const m = meta[estado]
  return (
    <span
      className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${m.c}`}
    >
      {m.t}
    </span>
  )
}
