/**
 * Motor de la alarma del SOS: hacer el ruido más fuerte posible para que
 * ENCUENTREN a quien está atrapado o extraviado.
 *
 * Todo el sonido se fabrica dentro del teléfono, sin descargar ningún archivo:
 * tiene que funcionar SIN Internet, que es justo cuando hace falta.
 *
 * ── El problema del iPhone ──────────────────────────────────────────────
 * En iOS el sonido sintetizado con Web Audio sale por la categoría de audio
 * "ambient", que el interruptor lateral de silencio APAGA. Ese interruptor
 * solo silencia el altavoz, no los audífonos: por eso la alarma se oía con
 * audífonos y no sin ellos. Es lo contrario de lo que hace falta, porque a
 * quien está atrapado tienen que oírlo DESDE AFUERA.
 *
 * ── La solución, en tres capas ──────────────────────────────────────────
 * No se confía en un solo mecanismo, porque si esa versión de iOS no lo
 * respeta la persona se queda sin alarma justo cuando la necesita:
 *
 *   1. Silencio en bucle: mantener un <audio> reproduciéndose (aunque suene
 *      silencio) cambia la sesión de audio de la página a la categoría
 *      "playback", que IGNORA el interruptor de silencio.
 *      Técnica de unmute-ios-audio (MIT, Feross Aboukhadijeh).
 *   2. Sirena como ARCHIVO real (no sintetizada) en un <audio> en bucle. iOS
 *      trata mucho mejor la reproducción de un archivo que el audio
 *      sintetizado, y además SIGUE SONANDO CON LA PANTALLA BLOQUEADA — clave
 *      para alguien atrapado que necesita ahorrar batería.
 *   3. Web Audio como respaldo, solo si lo anterior no arrancó.
 *
 * Todo debe iniciarse DENTRO de un toque del usuario: iOS no permite empezar
 * a sonar fuera de un gesto.
 */

const TAU = Math.PI * 2

function escribirTexto(v: DataView, pos: number, s: string) {
  for (let i = 0; i < s.length; i++) v.setUint8(pos + i, s.charCodeAt(i))
}

/** Envuelve muestras PCM de 8 bits mono en un archivo WAV completo. */
function armarWav(muestras: Uint8Array, sampleRate: number): ArrayBuffer {
  const n = muestras.length
  const buf = new ArrayBuffer(44 + n)
  const v = new DataView(buf)

  escribirTexto(v, 0, 'RIFF')
  v.setUint32(4, 36 + n, true)
  escribirTexto(v, 8, 'WAVE')
  escribirTexto(v, 12, 'fmt ')
  v.setUint32(16, 16, true) // tamaño del bloque fmt
  v.setUint16(20, 1, true) // formato PCM sin comprimir
  v.setUint16(22, 1, true) // 1 canal (mono)
  v.setUint32(24, sampleRate, true)
  v.setUint32(28, sampleRate, true) // bytes por segundo (1 canal × 8 bits)
  v.setUint16(32, 1, true) // alineación de bloque
  v.setUint16(34, 8, true) // 8 bits por muestra
  escribirTexto(v, 36, 'data')
  v.setUint32(40, n, true)
  new Uint8Array(buf, 44).set(muestras)
  return buf
}

/**
 * WAV mínimo de silencio, como data URI. Es el que abre la sesión de audio
 * en iOS (capa 1). En PCM de 8 bits el silencio es 128, el punto medio.
 */
function wavSilencio(sampleRate: number): string {
  const buf = armarWav(new Uint8Array(256).fill(128), sampleRate)
  const arr = new Uint8Array(buf)
  let bin = ''
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i])
  return `data:audio/wav;base64,${btoa(bin)}`
}

/**
 * Sirena de 2 segundos que sube y baja entre 700 y 1900 Hz, en onda cuadrada
 * y a volumen máximo. Se usa onda cuadrada porque suena más aguda y penetrante
 * que una senoidal: atraviesa mejor los escombros y el ruido de fondo. Y sube
 * y baja porque un tono fijo se vuelve "ruido de fondo" para el oído a los
 * pocos segundos, mientras que uno que varía sigue llamando la atención.
 *
 * Devuelve una URL de blob (no un data URI) para no cargar ~60 KB de texto
 * base64 en memoria por gusto.
 */
function crearUrlSirena(): string {
  const sampleRate = 22050 // de sobra: el tono más agudo es 1900 Hz
  const n = sampleRate * 2 // 2 segundos, se repite en bucle
  const muestras = new Uint8Array(n)

  let fase = 0
  for (let i = 0; i < n; i++) {
    // Barrido triangular: 0 → 1 → 0 a lo largo del bucle, para que el final
    // enganche con el principio y no se oiga un salto al repetirse.
    const t = i / n
    const rampa = t < 0.5 ? t * 2 : (1 - t) * 2
    const frecuencia = 700 + rampa * 1200
    fase += (TAU * frecuencia) / sampleRate
    if (fase > TAU) fase -= TAU
    muestras[i] = fase < Math.PI ? 255 : 0 // onda cuadrada a tope
  }

  const blob = new Blob([armarWav(muestras, sampleRate)], { type: 'audio/wav' })
  return URL.createObjectURL(blob)
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

// La sirena se fabrica una sola vez y se reutiliza en cada activación.
let urlSirena: string | null = null

let audioSilencio: HTMLAudioElement | null = null
let audioSirena: HTMLAudioElement | null = null
let ctx: AudioContext | null = null
let oscilador: OscillatorNode | null = null
let barrido: number | null = null
let bloqueoPantalla: { release: () => Promise<void> } | null = null

/** Capa 1: abre la sesión de audio "playback" en iOS. */
function abrirSesionIOS(sampleRate: number) {
  if (!esIOS() || audioSilencio) return
  const a = document.createElement('audio')
  a.setAttribute('x-webkit-airplay', 'deny') // fuera del centro de control
  a.preload = 'auto'
  a.loop = true
  a.src = wavSilencio(sampleRate)
  a.load()
  audioSilencio = a
  void a.play().catch(() => {
    a.removeAttribute('src')
    a.load()
    audioSilencio = null
  })
}

/** Capa 3: sirena sintetizada con Web Audio. Solo si la capa 2 no arrancó. */
function arrancarWebAudio(): boolean {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext
    if (!AudioCtx) return false
    const c = new AudioCtx()
    // En iOS el contexto nace suspendido: hay que reanudarlo en el gesto.
    void c.resume().catch(() => {})
    const osc = c.createOscillator()
    const ganancia = c.createGain()
    osc.type = 'square'
    ganancia.gain.value = 1
    osc.connect(ganancia)
    ganancia.connect(c.destination)
    osc.start()
    ctx = c
    oscilador = osc

    let freq = 700
    let subiendo = true
    const paso = () => {
      freq += subiendo ? 45 : -45
      if (freq >= 1900) subiendo = false
      if (freq <= 700) subiendo = true
      osc.frequency.setValueAtTime(freq, c.currentTime)
      barrido = window.setTimeout(paso, 55)
    }
    paso()
    return true
  } catch {
    return false
  }
}

/**
 * Enciende la alarma. Devuelve false solo si NINGUNA capa logró sonar, para
 * que la pantalla pueda avisar en vez de fingir que está sonando.
 * Debe llamarse dentro del toque del usuario.
 */
export async function iniciarAlarma(): Promise<boolean> {
  detenerAlarma()

  abrirSesionIOS(44100)

  // Capa 2 (principal): la sirena como archivo real, en bucle.
  let sonando = false
  try {
    if (!urlSirena) urlSirena = crearUrlSirena()
    const a = document.createElement('audio')
    a.src = urlSirena
    a.loop = true
    a.preload = 'auto'
    a.setAttribute('playsinline', '') // no abrir reproductor a pantalla completa
    a.volume = 1
    audioSirena = a
    await a.play()
    sonando = true
  } catch {
    // No arrancó (política del navegador, formato, etc.): la limpiamos y
    // caemos al respaldo sintetizado.
    audioSirena?.removeAttribute('src')
    audioSirena = null
  }

  // Capa 3 (respaldo): solo si la sirena de archivo no llegó a sonar.
  if (!sonando) sonando = arrancarWebAudio()

  if (!sonando) {
    detenerAlarma()
    return false
  }

  // Mantiene la pantalla encendida: si se apaga, algunos navegadores cortan
  // el audio — y además la pantalla iluminada ayuda a que te vean de noche.
  try {
    const nav = navigator as Navigator & {
      wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> }
    }
    bloqueoPantalla = (await nav.wakeLock?.request('screen')) ?? null
  } catch {
    /* el navegador no lo soporta o lo negó: no es crítico */
  }

  // Vibración además del sonido. Ojo: iOS NO soporta esta función en Safari,
  // así que en iPhone no hace nada (no falla, simplemente no existe).
  if (navigator.vibrate) navigator.vibrate([400, 150, 400, 150, 400, 150])

  return true
}

/** Apaga la alarma y suelta todo. Seguro de llamar aunque no esté sonando. */
export function detenerAlarma(): void {
  if (barrido !== null) {
    window.clearTimeout(barrido)
    barrido = null
  }
  try {
    oscilador?.stop()
  } catch {
    /* ya estaba detenido */
  }
  void ctx?.close().catch(() => {})
  oscilador = null
  ctx = null

  for (const a of [audioSirena, audioSilencio]) {
    if (!a) continue
    a.pause()
    a.removeAttribute('src')
    a.load()
  }
  audioSirena = null
  audioSilencio = null

  void bloqueoPantalla?.release().catch(() => {})
  bloqueoPantalla = null

  if (navigator.vibrate) navigator.vibrate(0)
}
