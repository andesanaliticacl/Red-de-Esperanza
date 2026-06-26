import { GoogleGenerativeAI } from '@google/generative-ai'
import type { Extraccion, NecesidadTipo, Urgencia } from './supabase.js'

const apiKey = process.env.GEMINI_API_KEY
// Modelo configurable. La guía v2 sugería gemini-1.5-flash; por defecto usamos
// un modelo flash vigente. Puedes fijar otro con GEMINI_MODEL en el entorno.
const MODELO = process.env.GEMINI_MODEL || 'gemini-2.0-flash'

const TIPOS_VALIDOS: NecesidadTipo[] = [
  'rescate',
  'agua_comida',
  'medicinas',
  'refugio',
  'otro',
]
const URGENCIAS_VALIDAS: Urgencia[] = ['alta', 'media', 'baja']

const PROMPT = `Eres un clasificador para una red de ayuda en emergencias.
Te paso el mensaje de una persona pidiendo ayuda. Devuelve SOLO un JSON con esta forma EXACTA:
{ "tipo": "...", "urgencia": "...", "zona": "...", "descripcion": "..." }

Reglas OBLIGATORIAS:
- "tipo" debe ser uno de: rescate, agua_comida, medicinas, refugio, otro.
  Si NO estás seguro del tipo, usa "otro". No adivines.
- "urgencia" debe ser uno de: alta, media, baja. Rescate o peligro de vida = alta.
- "zona": el lugar/barrio si se menciona claramente. Si NO hay zona clara, deja "" (vacío). NUNCA inventes lugares.
- NUNCA inventes coordenadas ni datos que no estén en el mensaje.
- "descripcion": un resumen breve y claro de la necesidad, en español.

Responde únicamente con el JSON, sin texto adicional.`

let modelo: ReturnType<GoogleGenerativeAI['getGenerativeModel']> | null = null
if (apiKey) {
  const genAI = new GoogleGenerativeAI(apiKey)
  modelo = genAI.getGenerativeModel({
    model: MODELO,
    generationConfig: { responseMimeType: 'application/json' },
  })
}

/** Reporte de respaldo cuando la IA falla: nunca se pierde un mensaje. */
function respaldo(texto: string): Extraccion {
  return { tipo: 'otro', urgencia: 'media', zona: '', descripcion: texto }
}

function sanear(obj: unknown, texto: string): Extraccion {
  const o = (obj ?? {}) as Record<string, unknown>
  const tipo = TIPOS_VALIDOS.includes(o.tipo as NecesidadTipo)
    ? (o.tipo as NecesidadTipo)
    : 'otro'
  const urgencia = URGENCIAS_VALIDAS.includes(o.urgencia as Urgencia)
    ? (o.urgencia as Urgencia)
    : 'media'
  const zona = typeof o.zona === 'string' ? o.zona.trim() : ''
  const descripcion =
    typeof o.descripcion === 'string' && o.descripcion.trim()
      ? o.descripcion.trim()
      : texto
  return { tipo, urgencia, zona, descripcion }
}

/** Extrae datos estructurados del texto. Si algo falla, devuelve respaldo. */
export async function extraer(texto: string): Promise<Extraccion> {
  if (!modelo) return respaldo(texto)
  try {
    const res = await modelo.generateContent([PROMPT, `Mensaje: ${texto}`])
    const raw = res.response.text()
    const parsed = JSON.parse(raw)
    return sanear(parsed, texto)
  } catch (e) {
    console.error('Gemini falló, usando respaldo:', (e as Error).message)
    return respaldo(texto)
  }
}
