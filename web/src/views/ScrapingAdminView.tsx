import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useDesaparecidos } from '../hooks/useDesaparecidos'
import { useNotificaciones } from '../context/NotificacionesContext'

/**
 * Panel de administración del scraping.
 * Fuente: desaparecidosterremotovenezuela.com (personas + centros de acopio).
 *
 * El scraping pesado lo hace un proceso Python/Playwright que corre en GitHub
 * Actions (no en el navegador, porque necesita la service_role key y puede
 * tardar). Este panel: (1) muestra el estado de la última corrida leyendo la
 * tabla `scraper_runs`, (2) administra lo ya cargado, (3) abre GitHub Actions
 * para lanzar una actualización manual.
 */

const ACTIONS_URL =
  'https://github.com/andesanaliticacl/Red-de-Esperanza/actions/workflows/scraper.yml'

interface Corrida {
  tipo: string
  estado: string
  total: number | null
  detalle: string | null
  iniciado_en: string
  finalizado_en: string | null
}

export default function ScrapingAdminView() {
  const { desaparecidos, cargando, recargar } = useDesaparecidos()
  const { notificar } = useNotificaciones()
  const [trabajando, setTrabajando] = useState<string | null>(null)
  const [corridas, setCorridas] = useState<Corrida[]>([])

  const total = desaparecidos.length
  const encontrados = desaparecidos.filter((d) => d.estado === 'encontrado').length
  const porLocalizar = total - encontrados

  async function cargarCorridas() {
    const { data } = await supabase
      .from('scraper_runs')
      .select('tipo, estado, total, detalle, iniciado_en, finalizado_en')
      .order('iniciado_en', { ascending: false })
      .limit(10)
    setCorridas((data ?? []) as Corrida[])
  }

  useEffect(() => {
    cargarCorridas()
  }, [])

  const ultimaPersonas = corridas.find((c) => c.tipo === 'personas')
  const ultimaCentros = corridas.find((c) => c.tipo === 'centros')

  async function alternarEstado(id: string, actual: string) {
    const nuevo = actual === 'encontrado' ? 'no_encontrado' : 'encontrado'
    setTrabajando(id)
    const { error } = await supabase
      .from('desaparecidos')
      .update({ estado: nuevo })
      .eq('id', id)
    if (error) notificar('No se pudo actualizar: ' + error.message, 'alerta')
    else await recargar()
    setTrabajando(null)
  }

  async function eliminar(id: string) {
    if (!confirm('¿Eliminar este registro de la lista de desaparecidos?')) return
    setTrabajando(id)
    const { error } = await supabase.from('desaparecidos').delete().eq('id', id)
    if (error) notificar('No se pudo eliminar: ' + error.message, 'alerta')
    else await recargar()
    setTrabajando(null)
  }

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-5">
      <div className="flex items-center gap-2">
        <Link to="/panel-x7k2" className="text-bandera-azul font-semibold no-underline">
          ← Admin
        </Link>
      </div>

      <header className="space-y-1">
        <h1 className="text-2xl font-extrabold text-bandera-azul">
          🔍 Scraping de desaparecidos
        </h1>
        <p className="text-sm text-gray-600">
          Datos extraídos de{' '}
          <span className="font-semibold">desaparecidosterremotovenezuela.com</span>.
          La actualización corre en GitHub Actions; aquí ves el estado y
          administras lo que se muestra en el mapa.
        </p>
      </header>

      {/* Estado de las corridas */}
      <section className="grid sm:grid-cols-2 gap-3">
        <EstadoCorrida titulo="👤 Personas" c={ultimaPersonas} />
        <EstadoCorrida titulo="📦 Centros de acopio" c={ultimaCentros} />
      </section>

      {/* Resumen + ejecutar */}
      <section className="card flex flex-wrap items-center gap-4">
        <div className="flex gap-4">
          <Dato n={total} etiqueta="Total" color="#475569" />
          <Dato n={porLocalizar} etiqueta="Por localizar" color="#7c3aed" />
          <Dato n={encontrados} etiqueta="Encontrados" color="#16a34a" />
        </div>
        <div className="ml-auto flex flex-col items-end gap-1">
          <a
            href={ACTIONS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-azul py-2.5 px-4 no-underline"
          >
            ▶️ Actualizar datos
          </a>
          <button
            onClick={cargarCorridas}
            className="text-xs text-bandera-azul underline"
          >
            ↻ Refrescar estado
          </button>
        </div>
      </section>

      <p className="text-xs text-gray-500 -mt-2">
        “Actualizar datos” abre GitHub Actions → pulsa <b>Run workflow</b>, elige{' '}
        <b>personas</b> o <b>centros</b> y confirma. El progreso aparece aquí
        arriba en unos minutos.
      </p>

      {/* Listado */}
      <section>
        <h2 className="font-bold text-lg mb-2">Registros ({total})</h2>
        {cargando ? (
          <div className="card text-center text-gray-500 py-8">Cargando…</div>
        ) : total === 0 ? (
          <div className="card text-center text-gray-500 py-8">
            Todavía no hay personas cargadas. Lanza una actualización para
            traerlas.
          </div>
        ) : (
          <div className="space-y-2">
            {desaparecidos.map((d) => (
              <div key={d.id} className="card flex items-center gap-3 py-3">
                <div className="text-2xl">
                  {d.estado === 'encontrado' ? '✅' : '🔍'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{d.nombre}</div>
                  <div className="text-xs text-gray-500 truncate">
                    {[
                      d.ultima_ubicacion,
                      d.fecha_desaparicion,
                      d.lat != null && d.lng != null ? '📍 en mapa' : 'sin coordenadas',
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <button
                    onClick={() => alternarEstado(d.id, d.estado)}
                    disabled={trabajando === d.id}
                    className="text-sm font-semibold px-3 py-1.5 rounded-lg border-2 border-bandera-azul text-bandera-azul disabled:opacity-60 whitespace-nowrap"
                  >
                    {d.estado === 'encontrado'
                      ? 'Marcar por localizar'
                      : 'Marcar encontrado'}
                  </button>
                  <button
                    onClick={() => eliminar(d.id)}
                    disabled={trabajando === d.id}
                    className="text-sm font-semibold px-3 py-1.5 rounded-lg border-2 border-bandera-rojo text-bandera-rojo disabled:opacity-60 whitespace-nowrap"
                  >
                    🗑️ Eliminar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function EstadoCorrida({ titulo, c }: { titulo: string; c?: Corrida }) {
  const color =
    c?.estado === 'ok' ? '#16a34a' : c?.estado === 'error' ? '#CC0001' : '#CF9B00'
  const texto =
    !c
      ? 'Nunca se ha ejecutado'
      : c.estado === 'corriendo'
      ? 'Ejecutándose ahora…'
      : c.estado === 'ok'
      ? `OK · ${c.total ?? 0} registros`
      : `Error: ${c.detalle ?? 'desconocido'}`
  const cuando = c?.finalizado_en ?? c?.iniciado_en
  return (
    <div className="card py-3">
      <div className="font-bold">{titulo}</div>
      <div className="text-sm font-semibold" style={{ color }}>
        {texto}
      </div>
      {cuando && (
        <div className="text-xs text-gray-400">
          {new Date(cuando).toLocaleString('es-VE')}
        </div>
      )}
    </div>
  )
}

function Dato({
  n,
  etiqueta,
  color,
}: {
  n: number
  etiqueta: string
  color: string
}) {
  return (
    <div className="text-center">
      <div className="text-2xl font-extrabold" style={{ color }}>
        {n}
      </div>
      <div className="text-xs text-gray-600">{etiqueta}</div>
    </div>
  )
}
