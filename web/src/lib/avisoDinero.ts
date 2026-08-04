/**
 * Detecta si un mensaje del chat habla de dinero (donaciones, cuentas
 * bancarias, transferencias...) para acompañarlo de un aviso.
 *
 * Red de Esperanza NO recauda ni intermedia donaciones: no hay ninguna cuenta
 * oficial. En una emergencia aparecen estafadores pidiendo depósitos, así que
 * cuando un mensaje menciona dinero se muestra una advertencia junto a él.
 *
 * Ojo: esto NO bloquea ni borra nada. Es solo un aviso al lector; alguien
 * puede estar pidiendo ayuda de buena fe y no queremos silenciarlo.
 */

/** Minúsculas y sin tildes, PERO conservando la ñ (si no, "doña" → "dona"). */
function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .replace(/ñ/g, '\u0001')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0001/g, 'ñ')
}

const PATRONES: RegExp[] = [
  // Donaciones
  /\bdona(r|cion|ciones|tivo|tivos|ndo|me|nos)?\b/,
  /\bdonad[oa]s?\b/,
  /\brecaud(ar|acion|ando|amos)\b/,
  // Cuentas y transferencias
  /\bcuenta\s+(bancaria|corriente|vista|rut|de\s+ahorros?)\b/,
  /\bn(?:°|º|ro\.?|umero)?\s*de\s+cuenta\b/,
  /\btransferenci?as?\b/,
  /\btransferir\b/,
  /\bdeposit(a|ar|ame|en|o|os)\b/,
  /\bpago\s*movil\b/,
  /\bbanco\b[\s\S]{0,40}\bcuenta\b/,
  /\bbanco\s+(estado|de\s+chile|santander|bci|scotiabank|itau|falabella|security|mercantil|banesco|provincial|venezuela|bbva)\b/,
  // Medios de pago digitales
  /\b(cbu|cvu|zelle|paypal|binance|usdt|bitcoin|criptomonedas?|cripto)\b/,
  // Peticiones directas de plata
  /\b(envi(a|en|ame)|mand(a|en|ame))\b[\s\S]{0,20}\b(dinero|plata|efectivo)\b/,
]

/** Cuántos dígitos tiene el texto (un número de cuenta deja muchos). */
function totalDigitos(texto: string): number {
  return (texto.match(/\d/g) ?? []).length
}

/**
 * ¿El mensaje menciona dinero, cuentas o donaciones? Combina palabras clave
 * con un indicio numérico: los números de cuenta dejan muchos dígitos sueltos,
 * y por sí solos ya merecen que el lector desconfíe.
 */
export function mencionaDinero(texto: string): boolean {
  const t = normalizar(texto)
  if (PATRONES.some((p) => p.test(t))) return true
  // 12+ dígitos suele ser un número de cuenta o RUT + cuenta. Un teléfono
  // normal (9-11 dígitos) no dispara el aviso por sí solo.
  return totalDigitos(t) >= 12
}

export const AVISO_DINERO =
  'Red de Esperanza no recauda donaciones ni tiene cuentas oficiales. Este mensaje lo escribió otra persona: verifica muy bien antes de enviar dinero.'
