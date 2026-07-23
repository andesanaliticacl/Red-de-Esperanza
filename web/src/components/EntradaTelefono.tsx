import { useMemo, useState } from 'react'
import SelectorBandera from './SelectorBandera'
import { PAISES_MUNDO } from '../lib/paises'

// La red ya no es solo Venezuela: el teléfono acepta CUALQUIER país.
// Chile es el país por defecto cuando no hay número guardado (emergencia
// activa ahora mismo); se puede cambiar libremente en el selector.
const ISO_DEFECTO = 'cl'

const OPCIONES_PAIS = PAISES_MUNDO.map((p) => ({
  value: p.iso,
  iso: p.iso,
  etiqueta: `${p.nombre} (${p.codigo})`,
  etiquetaCorta: p.codigo,
}))

/**
 * Valida un teléfono internacional guardado como "+<código> <número>".
 * Reglas suaves (cada país numera distinto): 6 a 14 dígitos locales,
 * máximo 17 dígitos en total y sin rachas largas de un mismo dígito
 * (basura tipo 000000000).
 */
export function esTelefonoValido(valor: string): boolean {
  const v = (valor ?? '').trim()
  if (!v.startsWith('+')) return false
  const digitos = v.replace(/\D/g, '')
  if (digitos.length < 8 || digitos.length > 17) return false
  const local = v.split(/\s+/).slice(1).join('').replace(/\D/g, '')
  if (local.length < 6) return false
  return !/(\d)\1{5,}/.test(local)
}

export function mensajeTelefono(): string {
  return 'El número no parece válido. Elige el país y escribe el número completo, por ejemplo +58 04121234567 o +56 912345678.'
}

// Compatibilidad con el nombre anterior (validación solo-Venezuela).
export const esTelefonoVenezuelaValido = esTelefonoValido
export const mensajeTelefonoVenezuela = mensajeTelefono

/** Separa un teléfono guardado ("+58 0412...") en país (iso) y número local. */
function separar(valor: string): { iso: string; numero: string } {
  const v = (valor ?? '').trim()
  if (!v.startsWith('+')) return { iso: ISO_DEFECTO, numero: '' }
  const [codigo, ...resto] = v.split(/\s+/)
  // Código más largo primero, para que "+58" no lo capture "+5" de nadie.
  const pais =
    PAISES_MUNDO.find((p) => p.codigo === codigo) ??
    [...PAISES_MUNDO]
      .sort((a, b) => b.codigo.length - a.codigo.length)
      .find((p) => v.startsWith(p.codigo))
  if (!pais) return { iso: ISO_DEFECTO, numero: v.replace(/\D/g, '') }
  const local = resto.length
    ? resto.join('')
    : v.slice(pais.codigo.length)
  return { iso: pais.iso, numero: local.replace(/\D/g, '') }
}

/**
 * Entrada de teléfono internacional: selector de país (con bandera y código)
 * + número local. Devuelve al padre el teléfono completo, p. ej.
 * "+58 04121234567" o "+56 912345678".
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
  const [tocado, setTocado] = useState(false)

  const pais = PAISES_MUNDO.find((p) => p.iso === iso) ?? PAISES_MUNDO[0]

  function emitir(nuevoIso: string, nuevoNumero: string) {
    const p = PAISES_MUNDO.find((x) => x.iso === nuevoIso) ?? PAISES_MUNDO[0]
    const num = nuevoNumero.replace(/\D/g, '').slice(0, 14)
    setIso(nuevoIso)
    setNumero(num)
    onChange(num ? `${p.codigo} ${num}` : '')
  }

  const mostrarError =
    tocado && numero.length > 0 && !esTelefonoValido(`${pais.codigo} ${numero}`)

  return (
    <div>
      <div className="flex gap-2">
        <SelectorBandera
          className="w-28 shrink-0"
          opciones={OPCIONES_PAIS}
          valor={iso}
          onChange={(nuevoIso) => emitir(nuevoIso, numero)}
        />
        <input
          className={`input flex-1 ${mostrarError ? 'border-bandera-rojo' : ''}`}
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="tel-national"
          placeholder={iso === 've' ? 'Ej: 04121234567' : 'Ej: 912345678'}
          required={requerido}
          value={numero}
          maxLength={14}
          onBlur={() => setTocado(true)}
          onChange={(e) => emitir(iso, e.target.value)}
        />
      </div>
      {mostrarError ? (
        <p className="text-xs text-bandera-rojo font-semibold mt-1">
          {mensajeTelefono()}
        </p>
      ) : (
        <p className="text-xs text-gray-500 mt-1">
          Elige tu país y escribe el número. Se guardará como {pais.codigo}{' '}
          {numero || '…'}
        </p>
      )}
    </div>
  )
}
