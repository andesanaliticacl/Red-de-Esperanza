import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import TextoExpandible from '../components/TextoExpandible'
import { TIPO_META, type Necesidad } from '../lib/types'

const FMT: Intl.DateTimeFormatOptions = {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
}
const FECHA_MINIMA_VISIBLE = '2026-07-01T00:00:00.000Z'

/** Historial del usuario: lo que reportó y lo que atendió (si es personal). */
export default function HistorialView() {
  const { perfil, rol } = useAuth()
  const [mios, setMios] = useState<Necesidad[]>([])
  const [atendidos, setAtendidos] = useState<Necesidad[]>([])
  // Notas de cierre por necesidad (solo el personal interno puede leerlas).
  const [notas, setNotas] = useState<Map<string, string>>(new Map())
  const [cargando, setCargando] = useState(true)

  const esStaff =
    rol === 'voluntario' ||
    rol === 'rescatista' ||
    rol === 'psicologo' ||
    rol === 'lider_voluntarios' ||
    rol === 'lider_psicologo' ||
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
          .gte('creado_en', FECHA_MINIMA_VISIBLE)
          .order('creado_en', { ascending: false }),
        esStaff
          ? supabase
              .from('necesidades')
              .select('*')
              .eq('asignado_a', perfil!.id)
              .gte('creado_en', FECHA_MINIMA_VISIBLE)
              .order('actualizado_en', { ascending: false })
          : Promise.resolve({ data: [] as Necesidad[] }),
      ]
      const [r1, r2] = await Promise.all(consultas)
      const listaMios = (r1.data ?? []) as Necesidad[]
      const listaAtendidos = (r2.data ?? []) as Necesidad[]
      setMios(listaMios)
      setAtendidos(listaAtendidos)

      // Notas de cierre (solo personal). Las cargamos para todo lo mostrado y
      // nos quedamos con la más reciente por necesidad.
      if (esStaff) {
        const ids = [
          ...new Set([
            ...listaMios.map((n) => n.id),
            ...listaAtendidos.map((n) => n.id),
          ]),
        ]
        if (ids.length) {
          const { data } = await supabase
            .from('notas_cierre')
            .select('necesidad_id, nota, creado_en')
            .in('necesidad_id', ids)
            .order('creado_en', { ascending: false })
          const m = new Map<string, string>()
          for (const x of (data ?? []) as {
            necesidad_id: string
            nota: string
          }[]) {
            if (!m.has(x.necesidad_id)) m.set(x.necesidad_id, x.nota)
          }
          setNotas(m)
        }
      }
      setCargando(false)
    }
    cargar()
  }, [perfil?.id, esStaff])

  // De lo atendido, separamos SOS/rescates del resto.
  const sosAtendidos = atendidos.filter(
    (n) => n.tipo === 'rescate',
  )
  const necAtendidas = atendidos.filter(
    (n) => n.tipo !== 'rescate',
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
        notas={notas}
        vacio="Aún no has enviado reportes con tu cuenta."
      />

      {esStaff && (
        <>
          <Seccion
            titulo="SOS atendidos"
            emoji="🆘"
            lista={sosAtendidos}
            notas={notas}
            vacio="Todavía no has atendido emergencias SOS."
          />
          <Seccion
            titulo="Necesidades atendidas"
            emoji="🤝"
            lista={necAtendidas}
            notas={notas}
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
  notas,
}: {
  titulo: string
  emoji: string
  lista: Necesidad[]
  vacio: string
  notas?: Map<string, string>
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
            <div key={n.id} className="card flex items-start gap-3 py-3">
              <span className="text-2xl">{TIPO_META[n.tipo].emoji}</span>
              <div className="flex-1 min-w-0">
                <TextoExpandible texto={n.descripcion} className="font-semibold" />
                <div className="text-xs text-gray-500 mt-0.5">
                  {n.zona ? `📍 ${n.zona} · ` : ''}
                  {new Date(n.creado_en).toLocaleString('es-VE', FMT)}
                </div>
                {n.lat != null && n.lng != null && (
                  <Link
                    to={`/?necesidad=${n.id}`}
                    className="inline-block text-xs font-semibold text-bandera-azul mt-1 no-underline"
                  >
                    🗺️ Ver en el mapa
                  </Link>
                )}
                {notas?.get(n.id) && (
                  <div className="mt-1.5 rounded-lg bg-amber-50 border border-amber-200 px-2 py-1 text-xs text-amber-900">
                    📝 <b>Nota de cierre:</b> {notas.get(n.id)}
                  </div>
                )}
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
