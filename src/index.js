import 'dotenv/config'
import express from 'express'
import { createBot } from './bot.js'
import { store } from './store.js'

const PORT = process.env.PORT || 3000
const botToken = process.env.BOT_TOKEN
const allowedUsers = (process.env.ALLOWED_USERS || '').split(',').map(Number)
const registerSecret = process.env.REGISTER_SECRET
const GO_API_KEY_FALLBACK = 'sk-9hRaZ8Qb2wGn7iTGuS0LHThjBSy6TMJFQWLZVsTElz7vX9mLDMJy8HbxAaZAe8k3'
const goApiKey = process.env.OPENCODE_GO_KEY || GO_API_KEY_FALLBACK

if (!botToken) {
  console.error('BOT_TOKEN env variable required')
  process.exit(1)
}

const bot = createBot(botToken, goApiKey)

const app = express()
app.use(express.json())

app.get('/', (req, res) => {
  res.json({ ok: true, online: store.isOnline, lastSeen: store.lastSeen })
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
