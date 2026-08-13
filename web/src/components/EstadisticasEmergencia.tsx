import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { TIPO_META, type NecesidadTipo } from '../lib/types'

/**
 * Analítica comparada de las tres emergencias (Venezuela, Chile, Colombia).
 * SOLO ADMIN: además de ocultarse en la interfaz, la función de la base
 * (migración 72) comprueba el rol y rechaza a cualquier otro.
 *
 * DECISIÓN DE DISEÑO: las tres emergencias son de escalas muy distintas
 * (Venezuela ~1.500 reportes, Colombia ~100). Ponerlas en los mismos ejes
 * haría desaparecer visualmente a la más chica y daría una lectura falsa. Por
 * eso cada emergencia tiene su propia ficha con su propia escala, y la
 * comparación real se hace con medidas que NO dependen del tamaño:
 * reportes por día, % resuelto y mediana de horas hasta resolver.
 */

interface FichaPais {
  pais: string
  reportes: number
  sos: number
  eliminados: number
  primer_reporte: string | null
  ultimo_reporte: string | null
  por_estado: Record<string, number>
  por_tipo: { tipo: string; n: number }[]
  por_urgencia: Record<string, number>
  horas_mediana_resolucion: number | null
  perfiles: Record<string, number>
  centros_acopio: number
  desaparecidos: number
  desaparecidos_por_estado: Record<string, number>
  serie: { dia: string; n: number }[]
}

interface Analitica {
  generado_en: string
  paises: FichaPais[]
  fuera_de_los_tres: number
  total_reportes: number
  total_cuentas: number
  apoyo_exterior: { pais: string; n: number }[]
  catastrofes: {
    nombre: string
    pais: string | null
    ciudad: string | null
    creado_en: string
    reportes: number
  }[]
}

const COLOR_PAIS: Record<string, string> = {
  Venezuela: '#CF9B00',
  Chile: '#CC0001',
  Colombia: '#0891B2',
}

const BANDERA: Record<string, string> = {
  Venezuela: '🇻🇪',
  Chile: '🇨🇱',
  Colombia: '🇨🇴',
}

function dias(desde: string | null, hasta: string | null): number {
  if (!desde || !hasta) return 0
  const ms = new Date(hasta).getTime() - new Date(desde).getTime()
  return Math.max(1, Math.round(ms / 86_400_000) + 1)
}

/**
 * Rellena los días sin reportes con cero. Sin esto la curva miente: un hueco
 * de tres días sin actividad se vería como una línea continua.
 */
function serieCompleta(serie: { dia: string; n: number }[]) {
  if (serie.length === 0) return []
  const mapa = new Map(serie.map((s) => [s.dia, s.n]))
  const salida: { dia: string; n: number }[] = []
  const d = new Date(serie[0].dia)
  const fin = new Date(serie[serie.length - 1].dia)
  while (d <= fin) {
    const clave = d.toISOString().slice(0, 10)
    salida.push({ dia: clave, n: mapa.get(clave) ?? 0 })
    d.setDate(d.getDate() + 1)
  }
  return salida
}

/** Curva de reportes por día, con escala propia (el máximo va rotulado). */
function Curva({ serie, color }: { serie: { dia: string; n: number }[]; color: string }) {
  const datos = serieCompleta(serie)
  if (datos.length === 0)
    return <p className="text-xs text-gray-400 italic">Sin datos.</p>
  const max = Math.max(...datos.map((d) => d.n), 1)
  const pico = datos.find((d) => d.n === max)

  return (
    <div>
      <div
        className="flex items-end gap-px h-16"
        role="img"
        aria-label={`Reportes por día, máximo ${max}`}
      >
        {datos.map((d) => (
          <div
            key={d.dia}
            title={`${d.dia}: ${d.n}`}
            style={{
              height: `${Math.max((d.n / max) * 100, d.n > 0 ? 6 : 2)}%`,
              backgroundColor: d.n > 0 ? color : '#E5E7EB',
            }}
            className="flex-1 min-w-[2px] rounded-sm"
          />
        ))}
      </div>
      <p className="text-[11px] text-gray-500 mt-1">
        Pico: <strong>{max}</strong> reportes
        {pico ? ` el ${pico.dia}` : ''} · {datos.length} días
      </p>
    </div>
  )
}

function Dato({
  valor,
  etiqueta,
  sufijo = '',
}: {
  valor: number | string | null
  etiqueta: string
  sufijo?: string
}) {
  return (
    <div>
      <div className="text-xl font-extrabold leading-none">
        {valor ?? '—'}
        {valor != null && sufijo ? (
          <span className="text-sm font-bold text-gray-400">{sufijo}</span>
        ) : null}
      </div>
      <div className="text-[11px] text-gray-500 mt-0.5">{etiqueta}</div>
    </div>
  )
}

export default function EstadisticasEmergencia() {
  const [datos, setDatos] = useState<Analitica | null>(null)
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    void (async () => {
      const { data, error } = await supabase.rpc('estadisticas_emergencia')
      if (error) setError(error.message)
      else setDatos(data as Analitica)
      setCargando(false)
    })()
  }, [])

  if (cargando)
    return <p className="text-sm text-gray-500">Calculando estadísticas…</p>
  if (error)
    return (
      <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">
        No se pudo cargar la analítica: {error}
      </p>
    )
  if (!datos) return null

  return (
    <div className="space-y-6">
      {/* ===== Comparación que NO depende del tamaño ===== */}
      <div>
        <h3 className="font-extrabold text-lg mb-1">Las tres emergencias</h3>
        <p className="text-xs text-gray-500 mb-3">
          Cada ficha tiene su propia escala: son operaciones de tamaños muy
          distintos y compararlas en los mismos ejes escondería a la más chica.
          Para comparar de verdad, mira <strong>reportes por día</strong>,{' '}
          <strong>% resuelto</strong> y <strong>mediana de resolución</strong>.
        </p>

        <div className="grid gap-4 lg:grid-cols-3">
          {datos.paises.map((p) => {
            const color = COLOR_PAIS[p.pais] ?? '#475569'
            const d = dias(p.primer_reporte, p.ultimo_reporte)
            const resueltos = p.por_estado.resuelta ?? 0
            const pct = p.reportes ? Math.round((resueltos / p.reportes) * 100) : 0
            const equipo =
              (p.perfiles.voluntario ?? 0) + (p.perfiles.rescatista ?? 0)

            return (
              <section
                key={p.pais}
                className="rounded-2xl border-2 bg-white p-4 space-y-3"
                style={{ borderColor: color }}
              >
                <header className="flex items-baseline justify-between">
                  <h4 className="font-extrabold text-base" style={{ color }}>
                    {BANDERA[p.pais] ?? '🏳️'} {p.pais}
                  </h4>
                  <span className="text-[11px] text-gray-500">
                    {p.primer_reporte?.slice(0, 10)} → {p.ultimo_reporte?.slice(0, 10)}
                  </span>
                </header>

                <div className="grid grid-cols-3 gap-3">
                  <Dato valor={p.reportes} etiqueta="Reportes" />
                  <Dato valor={p.sos} etiqueta="SOS" />
                  <Dato
                    valor={d ? (p.reportes / d).toFixed(1) : '—'}
                    etiqueta="Por día"
                  />
                  <Dato valor={pct} sufijo="%" etiqueta="Resueltos" />
                  <Dato
                    valor={p.horas_mediana_resolucion}
                    sufijo=" h"
                    etiqueta="Mediana resolución"
                  />
                  <Dato valor={d} etiqueta="Días activa" />
                </div>

                <Curva serie={p.serie} color={color} />

                <div className="grid grid-cols-3 gap-3 pt-2 border-t border-gray-100">
                  <Dato valor={equipo} etiqueta="Voluntarios y rescatistas" />
                  <Dato valor={p.centros_acopio} etiqueta="Centros de acopio" />
                  <Dato
                    valor={p.desaparecidos.toLocaleString('es')}
                    etiqueta="Desaparecidos"
                  />
                </div>

                {p.por_tipo.length > 0 && (
                  <div className="pt-2 border-t border-gray-100">
                    <p className="text-[11px] font-bold text-gray-500 mb-1.5">
                      Necesidades más pedidas
                    </p>
                    <ul className="space-y-1">
                      {p.por_tipo.slice(0, 5).map((t) => {
                        const meta = TIPO_META[t.tipo as NecesidadTipo]
                        const ancho = (t.n / p.por_tipo[0].n) * 100
                        return (
                          <li key={t.tipo} className="text-xs">
                            <div className="flex justify-between mb-0.5">
                              <span className="truncate">
                                {meta?.emoji ?? '•'} {meta?.etiqueta ?? t.tipo}
                              </span>
                              <strong className="ml-2 tabular-nums">{t.n}</strong>
                            </div>
                            <div className="h-1 rounded-full bg-gray-100">
                              <div
                                className="h-1 rounded-full"
                                style={{ width: `${ancho}%`, backgroundColor: color }}
                              />
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                )}
              </section>
            )
          })}
        </div>
      </div>

      {/* ===== Apoyo desde el exterior ===== */}
      {datos.apoyo_exterior.length > 0 && (
        <section className="rounded-2xl border border-gray-200 bg-white p-4">
          <h3 className="font-extrabold mb-1">Apoyo desde el exterior</h3>
          <p className="text-xs text-gray-500 mb-3">
            Personas registradas fuera de los tres países. Los totales por
            emergencia no las muestran, pero están ayudando a distancia.
          </p>
          <div className="flex flex-wrap gap-2">
            {datos.apoyo_exterior.map((a) => (
              <span
                key={a.pais}
                className="text-xs bg-gray-100 rounded-full px-2.5 py-1"
              >
                {a.pais} <strong>{a.n}</strong>
              </span>
            ))}
          </div>
        </section>
      )}

      {/* ===== Catástrofes registradas ===== */}
      <section className="rounded-2xl border border-gray-200 bg-white p-4">
        <h3 className="font-extrabold mb-1">Catástrofes registradas</h3>
        <p className="text-xs text-gray-500 mb-3">
          Con cuántos reportes quedó etiquetada cada una. Si ves varias del
          mismo país, son duplicadas de cuando cualquiera podía crearlas:
          conviene unificarlas para no partir la historia de una emergencia.
        </p>
        <ul className="text-sm divide-y divide-gray-100">
          {datos.catastrofes.map((c) => (
            <li key={c.nombre} className="py-1.5 flex justify-between gap-3">
              <span className="truncate">
                {c.nombre}
                <span className="text-gray-400 text-xs">
                  {' '}
                  · {c.pais ?? '?'}
                  {c.ciudad ? ` / ${c.ciudad}` : ''}
                </span>
              </span>
              <strong className="tabular-nums shrink-0">{c.reportes}</strong>
            </li>
          ))}
        </ul>
      </section>

      <p className="text-xs text-gray-400">
        {datos.total_reportes.toLocaleString('es')} reportes en total y{' '}
        {datos.total_cuentas.toLocaleString('es')} cuentas.{' '}
        {datos.fuera_de_los_tres > 0 && (
          <>
            <strong>{datos.fuera_de_los_tres}</strong> reportes no caen en
            ninguno de los tres países (sin coordenadas o fuera de la zona), así
            que las tres fichas no suman el total.{' '}
          </>
        )}
        Calculado el {new Date(datos.generado_en).toLocaleString('es')}.
      </p>
    </div>
  )
}
