import 'dotenv/config'
import express from 'express'
import { execSync } from 'child_process'
import { createBot } from './bot.js'
import { store } from './store.js'
import { fetchWeatherByCoords } from './client.js'

const PORT = process.env.PORT || 3000
let GIT_HASH = ''
try { GIT_HASH = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim() } catch {}
const botToken = process.env.BOT_TOKEN
const registerSecret = process.env.REGISTER_SECRET
const opencodePassword = process.env.OPENCODE_SERVER_PASSWORD || ''
const GO_API_KEY_FALLBACK = 'sk-9hRaZ8Qb2wGn7iTGuS0LHThjBSy6TMJFQWLZVsTElz7vX9mLDMJy8HbxAaZAe8k3'
const goApiKey = process.env.OPENCODE_GO_KEY || GO_API_KEY_FALLBACK
const groqApiKey = process.env.GROQ_API_KEY || ''
const deepSeekApiKey = process.env.DEEPSEEK_API_KEY || ''
const searchxKey = process.env.SEARCHX_API_KEY || ''

if (!botToken) {
  console.error('BOT_TOKEN env variable required')
  process.exit(1)
}

console.log(`🔑 Zen API: ${goApiKey ? 'loaded' : 'missing'}`)
console.log(`🔑 Groq API: ${groqApiKey ? 'loaded (' + groqApiKey.slice(0, 10) + '...)' : 'missing'}`)
console.log(`🔑 DeepSeek API: ${deepSeekApiKey ? 'loaded (' + deepSeekApiKey.slice(0, 10) + '...)' : 'missing'}`)
console.log(`🔍 SearchX API: ${searchxKey ? 'loaded (' + searchxKey.slice(0, 10) + '...)' : 'missing'}`)

const bot = createBot(botToken, goApiKey, groqApiKey, deepSeekApiKey, opencodePassword)

const sentWeather = new Set()

function startWeatherCron(botInstance) {
  setInterval(async () => {
    const now = new Date()
    const utcH = now.getUTCHours() + 5
    const h = utcH >= 24 ? utcH - 24 : utcH
    const m = now.getMinutes()
    const dayKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`
    const key = (t) => `${dayKey}-${t}`

    if ((h === 8 || h === 13 || h === 19) && m >= 0 && m <= 5) {
      const timeKey = h === 8 ? '08:00' : h === 13 ? '13:00' : '19:00'
      const k = key(timeKey)
      if (sentWeather.has(k)) return
      sentWeather.add(k)

      const userIds = Object.keys(store.userLocations)
      for (const uid of userIds) {
        const loc = store.userLocations[uid]
        try {
          const w = await fetchWeatherByCoords(loc.lat, loc.lon)
          await botInstance.telegram.sendMessage(Number(uid),
            `${timeKey} ${loc.name || 'Ob-havo'}\n${w}`)
        } catch (e) {
          console.error(`Weather cron user ${uid}: ${e.message}`)
        }
      }
    }
  }, 180000)
}

function startSelfKeepAlive() {
  const SELF_URL = process.env.RENDER_EXTERNAL_URL || 'https://opencode-telegram-bot.onrender.com'
  setInterval(async () => {
    try {
      const res = await fetch(SELF_URL, { signal: AbortSignal.timeout(10000) })
      console.log(`🔁 Self-ping: ${res.status}`)
    } catch (e) {
      console.log(`🔁 Self-ping failed: ${e.message}`)
    }
  }, 480_000)
}

const app = express()
app.use(express.json())

app.get('/', (req, res) => {
  res.json({ ok: true, online: store.isOnline, lastSeen: store.lastSeen, commit: GIT_HASH })
})

app.post('/register', (req, res) => {
  const { secret, url } = req.body
  if (secret !== registerSecret) {
    return res.status(403).json({ ok: false, error: 'Invalid secret' })
  }
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ ok: false, error: 'url required' })
  }
  store.tunnelUrl = url.replace(/\/$/, '')
  store.lastSeen = Date.now()
  console.log(`📡 Registered tunnel: ${store.tunnelUrl}`)
  res.json({ ok: true })
})

app.post('/ping', (req, res) => {
  const { secret } = req.body
  if (secret !== registerSecret) {
    return res.status(403).json({ ok: false, error: 'Invalid secret' })
  }
  store.lastSeen = Date.now()
  res.json({ ok: true })
})

const server = app.listen(PORT, () => {
  console.log(`📡 Server running on port ${PORT}`)
})

bot.launch().then(() => {
  console.log('🤖 Telegram bot started')
  startWeatherCron(bot)
  startSelfKeepAlive()
}).catch(err => {
  console.error('Bot failed:', err)
  process.exit(1)
})

process.once('SIGINT', () => {
  bot.stop('SIGINT')
  server.close()
})

process.once('SIGTERM', () => {
  bot.stop('SIGTERM')
  server.close()
})
