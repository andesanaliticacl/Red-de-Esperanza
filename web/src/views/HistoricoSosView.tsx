import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { cargarContactosNecesidad } from '../lib/contactos'
import TextoExpandible from '../components/TextoExpandible'
import { estaVencida } from '../lib/vida'
import type { Necesidad } from '../lib/types'

const COLS =
  'id, tipo, urgencia, estado, descripcion, zona, lat, lng, origen, reportado_por, asignado_a, creado_en, eliminada_del_mapa, ultimo_refresco, refrescos'
const LIMITE = 500

type FiltroEstado = 'todos' | 'activo' | 'en_proceso' | 'resuelta' | 'oculto'

function fechaCorta(iso: string): string {
  return new Date(iso).toLocaleString('es-VE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Histórico COMPLETO de botones SOS: todos los rescates que se han
 * reportado alguna vez, incluidos los que ya vencieron (4 días sin
 * renovar) y se ocultaron del mapa público. Nada se borra de la base
 * (ver migración 46), así que este historial siempre puede reconstruirse.
 *
 * Pensado para que rescatistas/voluntarios verifiquen, si hace falta,
 * TODO lo que se pidió alguna vez — no solo lo que sigue visible hoy.
 */
export default function HistoricoSosView() {
  const [sos, setSos] = useState<Necesidad[]>([])
  const [contactos, setContactos] = useState<Map<string, string>>(new Map())
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>('todos')
  const [busqueda, setBusqueda] = useState('')

  useEffect(() => {
    async function cargar() {
      const { data, error } = await supabase
        .from('necesidades')
        .select(COLS)
        .eq('tipo', 'rescate')
        .order('creado_en', { ascending: false })
        .limit(LIMITE)
      if (error) {
        setError(error.message)
        setCargando(false)
        return
      }
      setSos((data ?? []) as unknown as Necesidad[])
      const mapaContactos = await cargarContactosNecesidad()
      const cont = new Map<string, string>()
      for (const [id, c] of mapaContactos) cont.set(id, c.contacto)
      setContactos(cont)
      setCargando(false)
    }
    void cargar()
  }, [])

  const lista = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return sos.filter((n) => {
      if (q && !(n.descripcion?.toLowerCase().includes(q) || n.zona?.toLowerCase().includes(q))) {
        return false
      }
      if (filtroEstado === 'todos') return true
      if (filtroEstado === 'oculto') {
        return !!n.eliminada_del_mapa || estaVencida(n)
      }
      if (n.eliminada_del_mapa) return false
      if (filtroEstado === 'activo') {
        return (
          (n.estado === 'sin_verificar' || n.estado === 'verificada') &&
          !estaVencida(n)
        )
      }
      return n.estado === filtroEstado
    })
  }, [sos, filtroEstado, busqueda])

  const stats = useMemo(() => {
    const total = sos.length
    const ocultos = sos.filter((n) => n.eliminada_del_mapa || estaVencida(n)).length
    const resueltos = sos.filter((n) => n.estado === 'resuelta').length
    return { total, ocultos, resueltos }
  }, [sos])

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <div>
        <Link to="/voluntario" className="text-sm font-semibold text-bandera-azul no-underline">
          ← Volver a atender solicitudes
        </Link>
        <h1 className="text-2xl font-extrabold text-bandera-azul mt-1">
          🆘 Histórico de SOS
        </h1>
        <p className="text-sm text-gray-600 mt-1">
          Todos los botones SOS que se han enviado, incluidos los que ya
          vencieron y se ocultaron del mapa. Nada se borra de la base: esta
          lista sirve para verificar cualquier caso pasado.
        </p>
      </div>

      <section className="card grid grid-cols-3 gap-2">
        <Stat etiqueta="Total histórico" n={stats.total} color="#CC0001" />
        <Stat etiqueta="Resueltos" n={stats.resueltos} color="#16A34A" />
        <Stat etiqueta="Ocultos / vencidos" n={stats.ocultos} color="#475569" />
      </section>

      <div className="card flex gap-2 flex-wrap">
        <select
          className="rounded-lg border px-2 py-2 text-sm font-semibold"
          value={filtroEstado}
          onChange={(e) => setFiltroEstado(e.target.value as FiltroEstado)}
        >
          <option value="todos">Todos</option>
          <option value="activo">Activos (visibles en el mapa)</option>
          <option value="en_proceso">En proceso</option>
          <option value="resuelta">Resueltos</option>
          <option value="oculto">Ocultos / vencidos</option>
        </select>
        <input
          className="rounded-lg border px-2 py-2 text-sm flex-1 min-w-[180px]"
          placeholder="Buscar por zona o descripción..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
      </div>

      {error && (
        <div className="card text-center text-bandera-rojo text-sm py-4">
          No se pudo cargar el histórico: {error}
        </div>
      )}

      {cargando ? (
        <div className="card text-center text-gray-500 py-8">Cargando…</div>
      ) : lista.length === 0 ? (
        <div className="card text-center text-gray-500 py-8">
          No hay SOS con este filtro.
        </div>
      ) : (
        <section className="space-y-2">
          {lista.map((n) => {
            const oculto = !!n.eliminada_del_mapa || estaVencida(n)
            return (
              <div
                key={n.id}
                className={`card flex items-start gap-3 py-3 ${oculto ? 'bg-gray-50 opacity-90' : ''}`}
              >
                <div className="text-2xl">🆘</div>
                <div className="flex-1 min-w-0 space-y-1">
                  <TextoExpandible texto={n.descripcion} className="font-semibold text-sm" />
                  {n.zona && <div className="text-xs text-gray-600">📍 {n.zona}</div>}
                  <div className="text-xs text-gray-500">
                    🕒 {fechaCorta(n.creado_en)}
                  </div>
                  {contactos.get(n.id) && (
                    <div className="text-xs font-semibold text-bandera-azul break-all">
                      📞 {contactos.get(n.id)}
                    </div>
                  )}
                  {oculto && (
                    <div className="text-xs font-bold text-gray-500">
                      {n.eliminada_del_mapa
                        ? '🗑️ Eliminado del mapa'
                        : '⏳ Vencido (sin renovar por 4 días)'}
                    </div>
                  )}
                </div>
                <EstadoChip estado={n.estado} />
              </div>
            )
          })}
        </section>
      )}
    </div>
  )
}

function Stat({ etiqueta, n, color }: { etiqueta: string; n: number; color: string }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 text-center">
      <div className="text-2xl font-extrabold leading-none" style={{ color }}>
        {n}
      </div>
      <div className="text-[11px] text-gray-600 mt-1">{etiqueta}</div>
    </div>
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
    <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${m.c}`}>
      {m.t}
    </span>
  )
}
