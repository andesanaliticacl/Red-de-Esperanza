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
 * RIF venezolano (identificador fiscal de empresas y personas): valida el
 * dígito verificador con el algoritmo del SENIAT.
 *
 * Formato: una letra de tipo + 8 dígitos + verificador. Ej: J-12345678-9
 *   V = persona natural venezolana   E = extranjera
 *   J = persona jurídica             P = pasaporte     G = gubernamental
 */
export function esRifVenezolanoValido(valor: string): boolean {
  const limpio = valor.trim().toUpperCase().replace(/[^0-9A-Z]/g, '')
  const m = /^([VEJPG])(\d{8})(\d)$/.exec(limpio)
  if (!m) return false
  const [, letra, cuerpo, dv] = m

  // Cada tipo de RIF pesa distinto en la fórmula.
  const VALOR_LETRA: Record<string, number> = { V: 1, E: 2, J: 3, P: 4, G: 5 }
  const PESOS = [3, 2, 7, 6, 5, 4, 3, 2]

  let suma = VALOR_LETRA[letra] * 4
  for (let i = 0; i < 8; i++) suma += Number(cuerpo[i]) * PESOS[i]

  let esperado = 11 - (suma % 11)
  // 10 y 11 no son dígitos: ambos casos colapsan a 0.
  if (esperado >= 10) esperado = 0
  return Number(dv) === esperado
}

/**
 * Documento de identidad de una PERSONA, según el país.
 *
 * Solo Chile y Venezuela tienen reglas definidas aquí. La red es global, así
 * que para el resto de los países no se inventa una validación: se acepta
 * cualquier cosa con forma razonable. Rechazar un documento legítimo de un
 * país cuyo formato no conocemos sería peor que aceptarlo.
 */
export function validarDocumentoPersona(
  pais: string,
  tipoDoc: TipoDocumento,
  valor: string,
): { valido: boolean; mensaje: string } {
  const v = valor.trim()
  if (!v) return { valido: false, mensaje: 'El documento es obligatorio.' }

  if (tipoDoc === 'pasaporte') {
    // Ningún pasaporte trae un verificador que se pueda comprobar a mano
    // (el de la banda MRZ no es el número que la gente escribe).
    return /^[A-Z0-9]{5,12}$/i.test(v.replace(/[^0-9A-Za-z]/g, ''))
      ? { valido: true, mensaje: '' }
      : {
          valido: false,
          mensaje: 'El pasaporte no parece válido. Escribe solo letras y números.',
        }
  }

  if (pais === 'Chile') {
    return esRutChilenoValido(v)
      ? { valido: true, mensaje: '' }
      : {
          valido: false,
          mensaje:
            'Ese RUT no es válido: el dígito verificador no calza. Ejemplo: 12.345.678-5.',
        }
  }

  if (pais === 'Venezuela') {
    // La cédula venezolana NO tiene dígito verificador, así que lo único
    // comprobable es el formato.
    return esCedulaVenezolanaValida(v)
      ? { valido: true, mensaje: '' }
      : {
          valido: false,
          mensaje: 'La cédula no es válida. Ejemplo: V-12345678.',
        }
  }

  return /^[A-Z0-9-]{5,20}$/i.test(v)
    ? { valido: true, mensaje: '' }
    : { valido: false, mensaje: 'Ese documento no parece válido.' }
}

/**
 * Identificador FISCAL de una organización (para facturar): RUT de empresa
 * en Chile, RIF en Venezuela. Los dos tienen dígito verificador y los dos se
 * comprueban de verdad — una factura emitida a un RUT inventado no sirve.
 */
export function validarIdFiscal(
  pais: string,
  valor: string,
): { valido: boolean; mensaje: string } {
  const v = valor.trim()
  if (!v) {
    return { valido: false, mensaje: 'El identificador fiscal es obligatorio.' }
  }

  if (pais === 'Chile') {
    // El RUT de empresa usa el mismo módulo 11 que el de una persona.
    return esRutChilenoValido(v)
      ? { valido: true, mensaje: '' }
      : {
          valido: false,
          mensaje:
            'Ese RUT de empresa no es válido: el dígito verificador no calza. Ejemplo: 76.123.456-0.',
        }
  }

  if (pais === 'Venezuela') {
    return esRifVenezolanoValido(v)
      ? { valido: true, mensaje: '' }
      : {
          valido: false,
          mensaje:
            'Ese RIF no es válido: el dígito verificador no calza. Ejemplo: J-12345678-4.',
        }
  }

  // Otro país: sin regla conocida, solo se exige algo con forma de código.
  return /^[A-Z0-9.\-/]{5,20}$/i.test(v)
    ? { valido: true, mensaje: '' }
    : { valido: false, mensaje: 'Ese identificador fiscal no parece válido.' }
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
