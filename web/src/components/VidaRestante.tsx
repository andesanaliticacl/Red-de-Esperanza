import { useEffect, useState } from 'react'
import {
  VIDA_DIAS,
  refrescarCentro,
  refrescarNecesidad,
  textoVidaRestante,
  vidaRestanteMs,
} from '../lib/vida'
import type { NecesidadTipo } from '../lib/types'

/**
 * Contador del ciclo de vida de 4 días + botón para renovarlo.
 *
 * CUALQUIER persona (incluso sin cuenta) puede tocar "Sigue vigente": el
 * contador vuelve a 4 días completos y queda registrado cuántas veces se
 * renovó. Si el ítem no vence (derrumbe, psicológica, hospital) no se
 * muestra nada.
 */
export default function VidaRestante({
  item,
  esCentro = false,
}: {
  item: {
    id: string
    tipo?: NecesidadTipo
    es_hospital?: boolean | null
    ultimo_refresco?: string | null
    creado_en: string
    refrescos?: number
  }
  esCentro?: boolean
}) {
  const [ahora, setAhora] = useState(Date.now())
  const [renovando, setRenovando] = useState(false)
  const [renovado, setRenovado] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  // El contador avanza solo (cada minuto) mientras el popup esté abierto.
  useEffect(() => {
    const id = window.setInterval(() => setAhora(Date.now()), 60_000)
    return () => window.clearInterval(id)
  }, [])
  void ahora // (solo fuerza el re-render periódico)

  const ms = renovado ? VIDA_DIAS * 24 * 3_600_000 : vidaRestanteMs(item)
  if (ms === null) return null // nunca vence

  const critico = ms < 24 * 3_600_000
  const refrescos = (item.refrescos ?? 0) + (renovado ? 1 : 0)

  async function renovar() {
    setRenovando(true)
    setErrorMsg('')
    try {
      if (esCentro) await refrescarCentro(item.id)
      else await refrescarNecesidad(item.id)
      setRenovado(true)
    } catch {
      setErrorMsg('No se pudo renovar. Revisa tu conexión e intenta de nuevo.')
    } finally {
      setRenovando(false)
    }
  }

  return (
    <div
      className={`mt-1 rounded-lg border px-2 py-1.5 text-xs ${
        renovado
          ? 'border-green-200 bg-green-50'
          : critico
            ? 'border-red-200 bg-red-50'
            : 'border-amber-200 bg-amber-50'
      }`}
    >
      {renovado ? (
        <span className="font-semibold text-green-700">
          ✅ ¡Gracias! Renovado por {VIDA_DIAS} días más.
        </span>
      ) : (
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className={`font-semibold ${critico ? 'text-bandera-rojo' : 'text-amber-700'}`}
          >
            ⏳ Se oculta en {textoVidaRestante(ms)}
          </span>
          <button
            type="button"
            onClick={() => void renovar()}
            disabled={renovando}
            className="inline-flex items-center bg-bandera-azul !text-white font-semibold px-2.5 py-1 rounded-lg disabled:opacity-60"
            title={`¿Sigue vigente? Renueva el contador a ${VIDA_DIAS} días`}
          >
            {renovando ? 'Renovando…' : '🔄 Sigue vigente'}
          </button>
        </div>
      )}
      {refrescos > 0 && (
        <div className="text-[10px] text-gray-500 mt-0.5">
          Renovado {refrescos} {refrescos === 1 ? 'vez' : 'veces'} por la
          comunidad.
        </div>
      )}
      {errorMsg && (
        <div className="text-[11px] font-semibold text-bandera-rojo mt-0.5">
          {errorMsg}
        </div>
      )}
    </div>
  )
}
