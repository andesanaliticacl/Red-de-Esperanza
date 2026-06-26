import 'dotenv/config'
import { Bot, webhookCallback } from 'grammy'
import { createServer } from 'node:http'
import { extraer } from './ia.js'
import {
  insertarNecesidad,
  actualizarUbicacion,
  type Extraccion,
} from './supabase.js'

const token = process.env.TELEGRAM_BOT_TOKEN
if (!token) throw new Error('Falta TELEGRAM_BOT_TOKEN en el entorno.')

const bot = new Bot(token)

// Recuerda el último reporte de cada usuario para adjuntarle su ubicación.
const ultimoReporte = new Map<number, string>()

const ETIQUETA_TIPO: Record<Extraccion['tipo'], string> = {
  rescate: '🆘 Rescate',
  agua_comida: '🥫 Agua/Comida',
  medicinas: '💊 Medicinas',
  refugio: '🏠 Refugio',
  otro: '❓ Otro',
}

bot.command('start', (ctx) =>
  ctx.reply(
    '🕊️ *Red de Esperanza*\n\n' +
      'Escríbeme qué necesitas (agua, comida, medicinas, rescate, refugio) y dónde estás. ' +
      'Lo registraré para que un voluntario lo verifique.\n\n' +
      'Luego puedes *compartir tu ubicación* 📍 para ubicarte en el mapa.\n\n' +
      'Usa /ayuda para más información.',
    { parse_mode: 'Markdown' },
  ),
)

bot.command('ayuda', (ctx) =>
  ctx.reply(
    'ℹ️ *Cómo usarme*\n\n' +
      '1. Escribe tu necesidad en un mensaje. Ej: "Necesito agua en Petare, urgente".\n' +
      '2. Te confirmo lo que registré.\n' +
      '3. Comparte tu ubicación 📍 (clip → Ubicación) para aparecer en el mapa.\n\n' +
      'Tu reporte aparece como *sin verificar* hasta que un voluntario lo confirme.',
    { parse_mode: 'Markdown' },
  ),
)

// Mensajes de texto → IA → inserta reporte.
bot.on('message:text', async (ctx) => {
  const texto = ctx.message.text.trim()
  if (!texto || texto.startsWith('/')) return

  await ctx.replyWithChatAction('typing')
  const e = await extraer(texto)
  const id = await insertarNecesidad(e, texto)

  if (!id) {
    await ctx.reply(
      '⚠️ Hubo un problema guardando tu reporte. Inténtalo de nuevo en un momento.',
    )
    return
  }

  ultimoReporte.set(ctx.from.id, id)

  await ctx.reply(
    `✅ *Registrado* (sin verificar)\n\n` +
      `${ETIQUETA_TIPO[e.tipo]}\n` +
      `Urgencia: ${e.urgencia}\n` +
      `${e.zona ? `Zona: ${e.zona}\n` : ''}` +
      `\n📍 Comparte tu ubicación para ubicarte en el mapa ` +
      `(clip → Ubicación).`,
    { parse_mode: 'Markdown' },
  )
})

// Ubicación compartida → actualiza el último reporte del usuario.
bot.on('message:location', async (ctx) => {
  const id = ultimoReporte.get(ctx.from.id)
  const { latitude, longitude } = ctx.message.location
  if (!id) {
    await ctx.reply(
      'Recibí tu ubicación, pero primero escríbeme qué necesitas y luego compártela.',
    )
    return
  }
  await actualizarUbicacion(id, latitude, longitude)
  await ctx.reply('📍 ¡Ubicación añadida a tu reporte! Gracias.')
})

bot.catch((err) => console.error('Error en el bot:', err))

// ---- Arranque: webhook en producción, long polling en local ----
const PUBLIC_URL = process.env.PUBLIC_URL
const PORT = Number(process.env.PORT) || 3000

if (PUBLIC_URL) {
  // Producción (Render): servidor HTTP que recibe el webhook de Telegram.
  const handle = webhookCallback(bot, 'http')
  const server = createServer(async (req, res) => {
    if (req.method === 'POST' && req.url === '/webhook') {
      try {
        await handle(req, res)
      } catch (e) {
        console.error(e)
        res.statusCode = 500
        res.end()
      }
    } else {
      res.statusCode = 200
      res.end('Red de Esperanza bot OK')
    }
  })
  server.listen(PORT, () => {
    console.log(`Bot (webhook) escuchando en puerto ${PORT}`)
    console.log(
      `Registra el webhook apuntando a: ${PUBLIC_URL}/webhook (ver README).`,
    )
  })
} else {
  // Local: long polling.
  bot.start({
    onStart: (info) =>
      console.log(`Bot @${info.username} corriendo en long polling (local).`),
  })
}
