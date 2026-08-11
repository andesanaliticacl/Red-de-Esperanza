import type { TipoDocumento } from './types'

/**
 * Validación de documentos de identidad. Hoy solo cubre los países donde la
 * red tiene equipo de psicología (Venezuela, Chile y Colombia): registrarse
 * como psicólogo/a exige uno de estos documentos válidos.
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

/** Cédula de ciudadanía colombiana: solo dígitos, 6 a 10 (no tiene dígito
 *  verificador — la Registraduría no publica un algoritmo comprobable). */
export function esCedulaColombianaValida(valor: string): boolean {
  const limpio = valor.trim().replace(/[^0-9]/g, '')
  return /^\d{6,10}$/.test(limpio)
}

/** Pasaporte colombiano: validación laxa, igual criterio que el venezolano. */
export function esPasaporteColombianoValido(valor: string): boolean {
  const limpio = valor.trim().toUpperCase().replace(/[^0-9A-Z]/g, '')
  return /^[A-Z0-9]{6,9}$/.test(limpio) && /\d/.test(limpio)
}

/**
 * NIT colombiano (identificador fiscal de organizaciones): valida el dígito
 * verificador con el algoritmo oficial de la DIAN (módulo 11 con pesos
 * primos). Ej: 900.123.456-7.
 */
export function esNitColombianoValido(valor: string): boolean {
  const limpio = valor.trim().replace(/[^0-9]/g, '')
  if (limpio.length < 9 || limpio.length > 16) return false
  const cuerpo = limpio.slice(0, -1)
  const dv = limpio.slice(-1)
  const PESOS = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71]
  let suma = 0
  for (let i = 0; i < cuerpo.length; i++) {
    const digito = Number(cuerpo[cuerpo.length - 1 - i])
    suma += digito * PESOS[i]
  }
  const resto = suma % 11
  const dvEsperado = resto > 1 ? 11 - resto : resto
  return Number(dv) === dvEsperado
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
 * ¿El texto TIENE PINTA de RUT chileno? (no dice si es válido, solo si la
 * persona quiso escribir un RUT). Sirve para no dejar que un RUT mal escrito
 * se cuele por la puerta de la cédula venezolana, cuyo formato es mucho más
 * permisivo: "12345678" pasa como cédula, pero si alguien escribe
 * "12.345.678-9" está claramente intentando un RUT y hay que comprobarlo.
 */
export function pareceRut(valor: string): boolean {
  const v = valor.trim().toUpperCase()
  // Un guion con el verificador al final, o terminar en K, son señales
  // inequívocas: la cédula venezolana no usa ninguna de las dos.
  return /-[0-9K]\s*$/.test(v) || /^\d{7,8}K$/.test(v.replace(/[^0-9K]/g, ''))
}

/**
 * Documento de una persona SIN saber su país (formularios abiertos, como
 * reportar un desaparecido o pedir apoyo emocional). Acepta cédula
 * venezolana, RUT chileno o cédula colombiana, pero si el texto tiene pinta
 * de RUT se exige que el dígito verificador calce: si no, cualquier RUT
 * inventado se colaría haciéndose pasar por cédula.
 */
export function validarDocumentoFlexible(
  valor: string,
): { valido: boolean; mensaje: string } {
  const v = valor.trim()
  if (!v) return { valido: false, mensaje: 'El documento es obligatorio.' }

  if (pareceRut(v)) {
    return esRutChilenoValido(v)
      ? { valido: true, mensaje: '' }
      : {
          valido: false,
          mensaje:
            'Ese RUT no es válido: el dígito verificador no calza. Ejemplo: 12.345.678-5.',
        }
  }

  if (
    esCedulaVenezolanaValida(v) ||
    esRutChilenoValido(v) ||
    esCedulaColombianaValida(v)
  ) {
    return { valido: true, mensaje: '' }
  }
  return {
    valido: false,
    mensaje:
      'Ese documento no parece válido. Escribe una cédula venezolana (ej. V-12345678), un RUT chileno (ej. 12.345.678-5) o una cédula colombiana (ej. 1023456789).',
  }
}

/**
 * Documento de identidad de una PERSONA, según el país.
 *
 * Solo Chile, Venezuela y Colombia tienen reglas definidas aquí. La red es
 * global, así que para el resto de los países no se inventa una validación:
 * se acepta cualquier cosa con forma razonable. Rechazar un documento
 * legítimo de un país cuyo formato no conocemos sería peor que aceptarlo.
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

  if (pais === 'Colombia') {
    // La cédula colombiana tampoco tiene dígito verificador comprobable.
    return esCedulaColombianaValida(v)
      ? { valido: true, mensaje: '' }
      : {
          valido: false,
          mensaje: 'La cédula no es válida. Ejemplo: 1023456789.',
        }
  }

  return /^[A-Z0-9-]{5,20}$/i.test(v)
    ? { valido: true, mensaje: '' }
    : { valido: false, mensaje: 'Ese documento no parece válido.' }
}

/**
 * Identificador FISCAL de una organización (para facturar): RUT de empresa
 * en Chile, RIF en Venezuela, NIT en Colombia. Los tres tienen dígito
 * verificador y los tres se comprueban de verdad — una factura emitida a un
 * identificador inventado no sirve.
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

  if (pais === 'Colombia') {
    return esNitColombianoValido(v)
      ? { valido: true, mensaje: '' }
      : {
          valido: false,
          mensaje:
            'Ese NIT no es válido: el dígito verificador no calza. Ejemplo: 900.123.456-7.',
        }
  }

  // Otro país: sin regla conocida, solo se exige algo con forma de código.
  return /^[A-Z0-9.\-/]{5,20}$/i.test(v)
    ? { valido: true, mensaje: '' }
    : { valido: false, mensaje: 'Ese identificador fiscal no parece válido.' }
}

/**
 * Valida el documento requerido para registrarse (o mantenerse) como
 * psicólogo/a: cédula o pasaporte venezolano, RUT o pasaporte chileno, o
 * cédula o pasaporte colombiano. Cualquier otro país queda bloqueado con un
 * mensaje claro, porque hoy no hay una regla de validación definida para su
 * documento.
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
        'El documento es obligatorio para registrarte como psicólogo/a: cédula o pasaporte venezolano, RUT o pasaporte chileno, o cédula o pasaporte colombiano.',
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
  if (pais === 'Colombia') {
    if (tipoDoc === 'cedula') {
      return esCedulaColombianaValida(v)
        ? { valido: true, mensaje: '' }
        : {
            valido: false,
            mensaje: 'La cédula colombiana no es válida. Ejemplo: 1023456789.',
          }
    }
    return esPasaporteColombianoValido(v)
      ? { valido: true, mensaje: '' }
      : {
          valido: false,
          mensaje:
            'El pasaporte colombiano no es válido. Escribe solo letras y números.',
        }
  }
  return {
    valido: false,
    mensaje:
      'Por ahora, para registrarte como psicólogo/a necesitas estar en Venezuela (cédula o pasaporte), Chile (RUT o pasaporte) o Colombia (cédula o pasaporte).',
  }
}
