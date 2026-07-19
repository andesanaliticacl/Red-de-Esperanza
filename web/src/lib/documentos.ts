import type { TipoDocumento } from './types'

/**
 * Validación de documentos de identidad. Hoy solo cubre los dos países donde
 * la red tiene equipo de psicología (Venezuela y Chile): registrarse como
 * psicólogo/a exige uno de estos cuatro documentos válidos.
 */

/** Cédula venezolana: prefijo opcional V/E + 6 a 8 dígitos. Ej: V-12345678. */
export function esCedulaVenezolanaValida(valor: string): boolean {
  const limpio = valor.trim().toUpperCase().replace(/[^0-9VE]/g, '')
  return /^[VE]?\d{6,8}$/.test(limpio)
}

/** Pasaporte venezolano: validación laxa (SAIME no publica un formato único
 *  y estable) — letras/números, 6 a 9 caracteres, con al menos un dígito. */
export function esPasaporteVenezolanoValido(valor: string): boolean {
  const limpio = valor.trim().toUpperCase().replace(/[^0-9A-Z]/g, '')
  return /^[A-Z0-9]{6,9}$/.test(limpio) && /\d/.test(limpio)
}

/** Deja solo dígitos y el dígito verificador (K) de un RUT chileno. */
function limpiarRut(valor: string): string {
  return valor.trim().toUpperCase().replace(/[^0-9K]/g, '')
}

/**
 * RUT chileno: valida el dígito verificador con el algoritmo módulo 11
 * oficial. Ej: 12.345.678-5, 12345678-5, 123456785.
 */
export function esRutChilenoValido(valor: string): boolean {
  const limpio = limpiarRut(valor)
  if (limpio.length < 2) return false
  const cuerpo = limpio.slice(0, -1)
  const dv = limpio.slice(-1)
  if (!/^\d{6,8}$/.test(cuerpo)) return false
  let suma = 0
  let multiplo = 2
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += Number(cuerpo[i]) * multiplo
    multiplo = multiplo === 7 ? 2 : multiplo + 1
  }
  const resto = 11 - (suma % 11)
  const dvEsperado = resto === 11 ? '0' : resto === 10 ? 'K' : String(resto)
  return dv === dvEsperado
}

/** Pasaporte chileno: validación laxa, igual criterio que el venezolano. */
export function esPasaporteChilenoValido(valor: string): boolean {
  const limpio = valor.trim().toUpperCase().replace(/[^0-9A-Z]/g, '')
  return /^[A-Z0-9]{6,9}$/.test(limpio) && /\d/.test(limpio)
}

/**
 * Valida el documento requerido para registrarse (o mantenerse) como
 * psicólogo/a: cédula o pasaporte venezolano, o RUT o pasaporte chileno.
 * Cualquier otro país queda bloqueado con un mensaje claro, porque hoy no
 * hay una regla de validación definida para su documento.
 */
export function validarDocumentoPsicologo(
  pais: string,
  tipoDoc: TipoDocumento,
  valor: string,
): { valido: boolean; mensaje: string } {
  const v = valor.trim()
  if (!v) {
    return {
      valido: false,
      mensaje:
        'El documento es obligatorio para registrarte como psicólogo/a: cédula o pasaporte venezolano, o RUT o pasaporte chileno.',
    }
  }
  if (pais === 'Venezuela') {
    if (tipoDoc === 'cedula') {
      return esCedulaVenezolanaValida(v)
        ? { valido: true, mensaje: '' }
        : {
            valido: false,
            mensaje: 'La cédula venezolana no es válida. Ejemplo: V-12345678.',
          }
    }
    return esPasaporteVenezolanoValido(v)
      ? { valido: true, mensaje: '' }
      : {
          valido: false,
          mensaje:
            'El pasaporte venezolano no es válido. Escribe solo letras y números.',
        }
  }
  if (pais === 'Chile') {
    if (tipoDoc === 'cedula') {
      return esRutChilenoValido(v)
        ? { valido: true, mensaje: '' }
        : {
            valido: false,
            mensaje: 'El RUT chileno no es válido. Ejemplo: 12.345.678-5.',
          }
    }
    return esPasaporteChilenoValido(v)
      ? { valido: true, mensaje: '' }
      : {
          valido: false,
          mensaje:
            'El pasaporte chileno no es válido. Escribe solo letras y números.',
        }
  }
  return {
    valido: false,
    mensaje:
      'Por ahora, para registrarte como psicólogo/a necesitas estar en Venezuela (cédula o pasaporte) o Chile (RUT o pasaporte).',
  }
}
