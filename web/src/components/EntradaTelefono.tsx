import { useMemo, useState } from 'react'
import { PAISES_MUNDO } from '../lib/paises'
import SelectorBandera, { type OpcionBandera } from './SelectorBandera'

// Países con código telefónico, para el selector (Venezuela primero).
const OPCIONES: OpcionBandera[] = PAISES_MUNDO.filter((p) => p.codigo).map(
  (p) => ({
    value: p.iso,
    iso: p.iso,
    etiqueta: `${p.codigo} ${p.nombre}`,
    etiquetaCorta: p.codigo,
  }),
)

const POR_ISO = Object.fromEntries(PAISES_MUNDO.map((p) => [p.iso, p]))

/** Intenta separar un teléfono guardado en "código" + "número". */
function separar(valor: string): { iso: string; numero: string } {
  const limpio = (valor ?? '').trim()
  // Buscamos el código más largo que haga prefijo (para no confundir +5 con +58).
  const candidatos = [...PAISES_MUNDO]
    .filter((p) => p.codigo && limpio.startsWith(p.codigo))
    .sort((a, b) => b.codigo.length - a.codigo.length)
  if (candidatos[0]) {
    return {
      iso: candidatos[0].iso,
      numero: limpio.slice(candidatos[0].codigo.length).trim(),
    }
  }
  return { iso: 've', numero: limpio.replace(/^\+/, '') }
}

/**
 * Entrada de teléfono con selector de código de país (bandera + código).
 * Devuelve al padre el teléfono completo, p. ej. "+58 4121234567".
 */
export default function EntradaTelefono({
  valor,
  onChange,
  requerido = false,
}: {
  valor: string
  onChange: (v: string) => void
  requerido?: boolean
}) {
  const inicial = useMemo(() => separar(valor), []) // solo al montar
  const [iso, setIso] = useState(inicial.iso)
  const [numero, setNumero] = useState(inicial.numero)

  function emitir(nuevoIso: string, nuevoNumero: string) {
    const codigo = POR_ISO[nuevoIso]?.codigo ?? ''
    const num = nuevoNumero.trim()
    onChange(num ? `${codigo} ${num}`.trim() : '')
  }

  return (
    <div className="flex gap-2">
      <SelectorBandera
        className="w-32 shrink-0"
        opciones={OPCIONES}
        valor={iso}
        onChange={(v) => {
          setIso(v)
          emitir(v, numero)
        }}
        placeholder="País"
      />
      <input
        className="input flex-1"
        inputMode="tel"
        placeholder="Número"
        required={requerido}
        value={numero}
        onChange={(e) => {
          setNumero(e.target.value)
          emitir(iso, e.target.value)
        }}
      />
    </div>
  )
}
