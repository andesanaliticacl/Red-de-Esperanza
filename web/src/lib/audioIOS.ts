/**
 * Desbloqueo del sonido en iPhone/iPad.
 *
 * EL PROBLEMA: en iOS el sonido creado con Web Audio (el que usa la alarma del
 * SOS) sale por la categoría de audio "ambient" del sistema, y esa categoría la
 * APAGA el interruptor lateral de silencio. Por eso la alarma se escucha con
 * audífonos —el interruptor solo silencia el altavoz— pero no por el altavoz
 * del teléfono. Es exactamente al revés de lo que hace falta: quien está
 * atrapado necesita que lo oigan DESDE AFUERA, no en sus propios audífonos.
 *
 * LA SOLUCIÓN: mantener un elemento <audio> reproduciéndose en bucle —aunque
 * lo que suene sea silencio— cambia la sesión de audio de la página a la
 * categoría "playback", que IGNORA el interruptor de silencio. Con esa sesión
 * abierta, el sonido de Web Audio también sale por el altavoz con el teléfono
 * en silencio.
 *
 * Técnica tomada de unmute-ios-audio (MIT, Feross Aboukhadijeh).
 *
 * IMPORTANTE: hay que llamarlo DENTRO de un gesto del usuario (el toque del
 * botón de alarma). iOS no deja iniciar audio fuera de un toque.
 */

function escribirTexto(v: DataView, pos: number, s: string) {
  for (let i = 0; i < s.length; i++) v.setUint8(pos + i, s.charCodeAt(i))
}

/**
 * Genera un WAV mínimo de silencio como data URI. Se construye aquí en vez de
 * cargar un archivo para que funcione SIN Internet, que es justo cuando la
 * alarma hace falta.
 */
function wavSilencioso(sampleRate: number): string {
  const muestras = 256 // ~6 ms: solo necesita existir y repetirse en bucle
  const buf = new ArrayBuffer(44 + muestras)
  const v = new DataView(buf)

  escribirTexto(v, 0, 'RIFF')
  v.setUint32(4, 36 + muestras, true)
  escribirTexto(v, 8, 'WAVE')
  escribirTexto(v, 12, 'fmt ')
  v.setUint32(16, 16, true) // tamaño del bloque fmt
  v.setUint16(20, 1, true) // formato PCM
  v.setUint16(22, 1, true) // mono
  v.setUint32(24, sampleRate, true)
  v.setUint32(28, sampleRate, true) // bytes por segundo (1 canal × 8 bits)
  v.setUint16(32, 1, true) // alineación de bloque
  v.setUint16(34, 8, true) // 8 bits por muestra
  escribirTexto(v, 36, 'data')
  v.setUint32(40, muestras, true)
  // En PCM de 8 bits el silencio es 128 (el punto medio), no 0.
  for (let i = 0; i < muestras; i++) v.setUint8(44 + i, 128)

  const arr = new Uint8Array(buf)
  let bin = ''
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i])
  return `data:audio/wav;base64,${btoa(bin)}`
}

/**
 * ¿Es un iPhone/iPad? Se detecta por la combinación de pantalla táctil y el
 * `webkitAudioContext` que solo existe en Safari, en vez de leer el nombre del
 * navegador (que iOS falsea y cambia entre versiones).
 */
export function esIOS(): boolean {
  if (typeof navigator === 'undefined' || typeof window === 'undefined')
    return false
  return navigator.maxTouchPoints > 0 && 'webkitAudioContext' in window
}

let audioSilencio: HTMLAudioElement | null = null

/** Abre la sesión de audio "playback" en iOS. Llamar dentro de un toque. */
export function desbloquearAudioIOS(sampleRate = 44100): void {
  if (!esIOS() || audioSilencio) return
  const a = document.createElement('audio')
  // Evita que la alarma aparezca como reproductor en el centro de control.
  a.setAttribute('x-webkit-airplay', 'deny')
  a.preload = 'auto'
  a.loop = true
  a.src = wavSilencioso(sampleRate)
  a.load()
  audioSilencio = a
  void a.play().catch(() => {
    // No se pudo abrir la sesión: soltamos el elemento para no dejarlo colgado.
    a.removeAttribute('src')
    a.load()
    audioSilencio = null
  })
}

/** Cierra la sesión de audio. Se llama al apagar la alarma. */
export function liberarAudioIOS(): void {
  if (!audioSilencio) return
  audioSilencio.pause()
  audioSilencio.removeAttribute('src')
  audioSilencio.load()
  audioSilencio = null
}
