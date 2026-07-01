import { useMemo, useState } from 'react'

const CODIGO_VENEZUELA = '+58'
const PREFIJO_BASE = '04'
const PREFIJOS_VALIDOS = ['0416', '0424', '0414', '0426', '0412', '0422']
const EJEMPLO_TELEFONO = '+58 04121234567'

export function esTelefonoVenezuelaValido(valor: string): boolean {
  const digitos = (valor ?? '').replace(/\D/g, '')
  const local = digitos.startsWith('58') ? digitos.slice(2) : digitos
  if (local.length !== 11) return false
  if (!PREFIJOS_VALIDOS.some((prefijo) => local.startsWith(prefijo))) return false
  return !/(\d)\1{3,}/.test(local)
}

export function mensajeTelefonoVenezuela(): string {
  return `El numero no es el esperado. Usa un celular venezolano valido, por ejemplo ${EJEMPLO_TELEFONO}.`
}

function normalizarNumeroLocal(valor: string): string {
  let digitos = (valor ?? '').replace(/\D/g, '')
  if (digitos.startsWith('58')) digitos = digitos.slice(2)
  if (digitos.startsWith('4')) digitos = `0${digitos}`
  if (!digitos) return PREFIJO_BASE
  if (!digitos.startsWith(PREFIJO_BASE)) {
    digitos = PREFIJO_BASE + digitos.replace(/^0+/, '')
  }
  return digitos.slice(0, 11)
}

/** Intenta separar un telefono guardado y deja solo el numero local venezolano. */
function separar(valor: string): { numero: string } {
  return { numero: normalizarNumeroLocal(valor) }
}

/**
 * Entrada de telefono venezolana. Devuelve al padre el telefono completo,
 * p. ej. "+58 04121234567".
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
  const [numero, setNumero] = useState(inicial.numero)
  const [tocado, setTocado] = useState(false)

  function emitir(nuevoNumero: string) {
    const num = normalizarNumeroLocal(nuevoNumero)
    setNumero(num)
    onChange(num.length > PREFIJO_BASE.length ? `${CODIGO_VENEZUELA} ${num}` : '')
  }

  const mostrarError =
    tocado &&
    numero.length > PREFIJO_BASE.length &&
    !esTelefonoVenezuelaValido(`${CODIGO_VENEZUELA} ${numero}`)

  return (
    <div>
      <div className="flex gap-2">
        <div className="input w-24 shrink-0 bg-gray-100 text-gray-700 font-bold flex items-center justify-center">
          {CODIGO_VENEZUELA}
        </div>
        <input
          className={`input flex-1 ${mostrarError ? 'border-bandera-rojo' : ''}`}
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="tel-national"
          placeholder="Ej: 04121234567"
          required={requerido}
          value={numero}
          maxLength={11}
          onBlur={() => setTocado(true)}
          onChange={(e) => emitir(e.target.value)}
        />
      </div>
      {numero === PREFIJO_BASE ? (
        <p className="text-xs text-gray-500 mt-1">
          Ejemplo: {EJEMPLO_TELEFONO}. Prefijos permitidos: 0416, 0424, 0414,
          0426, 0412 y 0422.
        </p>
      ) : mostrarError ? (
        <p className="text-xs text-bandera-rojo font-semibold mt-1">
          {mensajeTelefonoVenezuela()}
        </p>
      ) : null}
    </div>
  )
}
