import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useDesaparecidos } from '../hooks/useDesaparecidos'
import { useNotificaciones } from '../context/NotificacionesContext'

/**
 * Panel de administración del scraping de personas desaparecidas
 * (fuente: venezuela-te-busca.com).
 *
 * Por ahora permite VER y ADMINISTRAR lo ya scrapeado (marcar encontrado/por
 * localizar, eliminar). La EJECUCIÓN del scraping todavía no está conectada:
 * el scraper es un proceso Python/Playwright que necesita un backend que lo
 * dispare y suba los resultados a Supabase. Eso se construye en el próximo paso.
 */
export default function ScrapingAdminView() {
  const { desaparecidos, cargando, recargar } = useDesaparecidos()
  const { notificar } = useNotificaciones()
  const [trabajando, setTrabajando] = useState<string | null>(null)

  const total = desaparecidos.length
  const encontrados = desaparecidos.filter((d) => d.estado === 'encontrado').length
  const porLocalizar = total - encontrados

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

  function ejecutarScraping() {
    // Aún no hay backend que dispare el proceso Python. Lo dejamos visible para
    // conectarlo en el siguiente paso (endpoint/edge function que corra el
    // scraper y haga upsert en la tabla `desaparecidos`).
    notificar(
      'La ejecución automática del scraping aún no está conectada. Se habilitará en el próximo paso.',
      'info',
    )
  }

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-5">
      <div className="flex items-center gap-2">
        <Link to="/admin" className="text-bandera-azul font-semibold no-underline">
          ← Admin
        </Link>
      </div>

      <header className="space-y-1">
        <h1 className="text-2xl font-extrabold text-bandera-azul">
          🔍 Scraping de desaparecidos
        </h1>
        <p className="text-sm text-gray-600">
          Datos extraídos de{' '}
          <span className="font-semibold">venezuela-te-busca.com</span>. Aquí
          puedes ejecutar la actualización y administrar lo que se muestra en el
          mapa.
        </p>
      </header>

      {/* Resumen + ejecutar */}
      <section className="card flex flex-wrap items-center gap-4">
        <div className="flex gap-4">
          <Dato n={total} etiqueta="Total" color="#475569" />
          <Dato n={porLocalizar} etiqueta="Por localizar" color="#7c3aed" />
          <Dato n={encontrados} etiqueta="Encontrados" color="#16a34a" />
        </div>
        <div className="ml-auto flex flex-col items-end gap-1">
          <button onClick={ejecutarScraping} className="btn-azul py-2.5 px-4">
            ▶️ Ejecutar scraping
          </button>
          <span className="text-xs text-gray-400">
            (pendiente de conectar al backend)
          </span>
        </div>
      </section>

      {/* Listado */}
      <section>
        <h2 className="font-bold text-lg mb-2">Registros ({total})</h2>
        {cargando ? (
          <div className="card text-center text-gray-500 py-8">Cargando…</div>
        ) : total === 0 ? (
          <div className="card text-center text-gray-500 py-8">
            Todavía no hay personas desaparecidas cargadas. Ejecuta el scraping
            cuando esté conectado para traerlas.
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
