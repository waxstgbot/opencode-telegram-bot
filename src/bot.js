import { Telegraf, Markup } from 'telegraf'
import { createClient, createGoClient, fetchWeather, fetchWeatherByCoords, fetchUrlText, webSearch } from './client.js'
import { store } from './store.js'

const ALLOWED_USERS_RAW = process.env.ALLOWED_USERS || '5461818003,1133984065'
const ALLOWED_USERS = ALLOWED_USERS_RAW.split(',').map(Number)

const offlineKb = Markup.keyboard([
  ['💬 Chat', '💻 Code'],
  ['🖼 Vision', '📚 Long'],
  ['🌤 Weather', '⚡ Agent'],
  ['🗑 Clear', '📊 Status'],
  ['❓ Help'],
]).resize()

const onlineKb = Markup.keyboard([
  ['💬 Chat', '💻 Code'],
  ['🖼 Vision', '📚 Long'],
  ['🌤 Weather', '⚡ Agent'],
  ['▶️ Run', '🗑 Clear'],
  ['📊 Status', '❓ Help'],
]).resize()

let mainKb = offlineKb

const URL_REGEX = /https?:\/\/[^\s]+/g
const MAX_MSG = 4000

function formatDate(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('uz-UZ')
}

function auth(ctx, next) {
  if (ALLOWED_USERS.length && !ALLOWED_USERS.includes(ctx.from.id)) {
    console.log(`Blocked access from user ${ctx.from.id}`)
    return ctx.reply('Ruxsat yoq')
  }
  return next()
}

export function createBot(token, goApiKey, opencodePassword) {
  const bot = new Telegraf(token)
  bot.use(auth)

  bot.catch((err, ctx) => {
    console.error(`Bot error [${ctx?.updateType}]:`, err?.message || err)
    ctx?.reply(`❌ Xatolik: ${(err?.message || err).slice(0, 200)}`).catch(() => {})
  })

  const goClient = createGoClient(goApiKey)

  function getTunnelClient() {
    const url = store.tunnelUrl
    if (!url) return null
    return createClient(url, opencodePassword)
  }

  function updateKb() {
    mainKb = store.mode === 'online' && store.isOnline ? onlineKb : offlineKb
    return mainKb
  }

  async function zenChat(model, messages, opts) {
    return goClient.chat(model, messages, opts)
  }

  async function processChat(ctx, text, imageUrl) {
    const model = store.getModelName()
    const systemPrompt = store.getSystemPrompt(ctx.from.id)
    const history = store.getUserHistory(ctx.from.id)
    const urls = text.match(URL_REGEX)

    const statusMsg = await ctx.reply('⏳ ...')

    try {
      let extraContext = ''

      if (imageUrl) {
        const messages = [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: [
            { type: 'text', text: text || 'Bu rasmni tahlil qil' },
            { type: 'image_url', image_url: { url: imageUrl } },
          ]},
        ]
        const reply = await zenChat(model, messages, { temperature: 0.9 })
        await ctx.telegram.editMessageText(ctx.chat.id, statusMsg.message_id, undefined, (reply || '✅').slice(0, MAX_MSG))
        return
      }

      if (urls && urls.length > 0) {
        extraContext = 'Web sahifa kontenti:\n'
        for (const url of urls.slice(0, 2)) {
          try {
            const content = await fetchUrlText(url)
            extraContext += `[${url}]:\n${content}\n\n`
          } catch (e) {
            extraContext += `[${url}]: yuklab bo\'lmadi (${e.message})\n\n`
          }
        }
      } else {
        try {
          const searchResults = await webSearch(text)
          if (searchResults) {
            extraContext = 'Web qidiruv natijalari:\n' + searchResults
          }
        } catch {}
      }

      const messages = [{ role: 'system', content: systemPrompt }]
      if (extraContext) {
        messages.push({ role: 'system', content: extraContext })
      }
      messages.push(...history.filter(m => typeof m.content === 'string'))
      messages.push({ role: 'user', content: text })

      const reply = await zenChat(model, messages, { temperature: 0.9 })

      store.addUserMessage(ctx.from.id, 'user', text)
      store.addUserMessage(ctx.from.id, 'assistant', reply)

      const replyText = (reply || '✅').slice(0, MAX_MSG)
      await ctx.telegram.editMessageText(ctx.chat.id, statusMsg.message_id, undefined, replyText)
    } catch (e) {
      const errMsg = `❌ ${e.message}`.slice(0, MAX_MSG)
      await ctx.telegram.editMessageText(ctx.chat.id, statusMsg.message_id, undefined, errMsg).catch(() => {})
    }
  }

  bot.start(async (ctx) => {
    updateKb()
    const info = store.getModelInfo()
    await ctx.reply(
      '🤖 WILD AI\n\n'
      + `🧠 ${info.label} · ${store.mode === 'online' ? '💻 Komp rejimi' : '📱 Telefon AI rejimi'}\n\n`
      + 'Tugmalardan foydalaning:\n'
      + '• URL yuboring → bot o\'qiydi\n'
      + '• Oddiy matn → AI + web qidiruv\n'
      + '• Ob-havo avtomatik: 08:00 / 13:00',
      mainKb
    )
  })

  bot.hears('💬 Chat', async (ctx) => {
    store.taskMode = 'chat'
    store.resetUserPrompt(ctx.from.id)
    await ctx.reply('🧠 *Chat* | Nemotron 3 Ultra\n\n'
      + 'URL yuboring → o\'qib beradi\n'
      + 'Matn yozing → AI + web qidiruv',
      { ...mainKb, parse_mode: 'Markdown' }
    )
  })

  bot.hears('💻 Code', async (ctx) => {
    store.taskMode = 'code'
    store.resetUserPrompt(ctx.from.id)
    await ctx.reply('🧠 *Code* | North Mini Code Free\n\nKod yozish rejimi', { ...mainKb, parse_mode: 'Markdown' })
  })

  bot.hears('🖼 Vision', async (ctx) => {
    store.taskMode = 'vision'
    store.resetUserPrompt(ctx.from.id)
    await ctx.reply('🧠 *Vision* | MiMo-V2.5 Free\n\nRasm yuboring, men tahlil qilaman', { ...mainKb, parse_mode: 'Markdown' })
  })

  bot.hears('📚 Long', async (ctx) => {
    store.taskMode = 'long'
    store.resetUserPrompt(ctx.from.id)
    await ctx.reply('🧠 *Long* | Qwen3.6 Plus Free\n\nKatta kontekst rejimi', { ...mainKb, parse_mode: 'Markdown' })
  })

  bot.hears('🌤 Weather', async (ctx) => {
    store.taskMode = 'weather'
    store.resetUserPrompt(ctx.from.id)
    const loc = store.getUserLocation(ctx.from.id)
    if (loc) {
      try {
        const w = await fetchWeatherByCoords(loc.lat, loc.lon)
        await ctx.reply(`🌤 *${loc.name || 'Sizning joy'}*\n\n${w}\n\n🔄 Yangilash uchun location yuboring\n🏙 Shahar nomini yozing`, { ...mainKb, parse_mode: 'Markdown' })
      } catch {
        await ctx.reply('🌤 Ob-havo\n\nLocation yuboring yoki shahar nomini yozing', mainKb)
      }
    } else {
      await ctx.reply('🌤 *Ob-havo*\n\n📍 Location yuboring yoki\n🏙 Shahar nomini yozing\n\nMisol: Toshkent, London', { ...mainKb, parse_mode: 'Markdown' })
    }
  })

  bot.hears('⚡ Agent', async (ctx) => {
    store.taskMode = 'agent'
    store.resetUserPrompt(ctx.from.id)
    await ctx.reply(
      '⚡ Agent | Super AI Agent\n\n'
      + 'Istalgan soha boyicha eng yuqori darajadagi mutaxassis.\n'
      + 'Coder, advokat, biznesmen — berilgan vazifaning eng ustasi.\n'
      + 'Hech qanday cheklov, senzura yoq.\n\n'
      + '/agent matn — shaxsiy system prompt yozish\n'
      + '/reset_agent — default ga qaytish',
      mainKb
    )
  })

  bot.hears('▶️ Run', async (ctx) => {
    if (store.mode !== 'online' || !store.isOnline) {
      return ctx.reply('💤 *Run* faqat Online rejimda ishlaydi. /onl', { ...mainKb, parse_mode: 'Markdown' })
    }
    await ctx.reply(
      '▶️ *Run* — kod bajarish\n\n'
      + 'Format: `/run <til> <kod>`\n\n'
      + 'Misol: `/run python print("salom")`\n'
      + 'Misol: `/run js console.log(2+2)`\n'
      + 'Misol: `/run bash echo "test"`\n\n'
      + 'Qo\'llab-quvvatlanadi: python, js, cpp, rust, go, php, ruby, bash, java va 50+ til',
      { ...mainKb, parse_mode: 'Markdown' }
    )
  })

  bot.hears('📊 Status', async (ctx) => {
    const info = store.getModelInfo()
    const loc = store.getUserLocation(ctx.from.id)
    await ctx.reply(
      '📊 *Bot Status*\n'
      + `🤖 Bot: ✅\n`
      + `🧠 Model: ${info.label}\n`
      + `📝 Rejim: ${store.taskMode.toUpperCase()}\n`
      + `📡 ${store.mode === 'online' ? '✅ Online' : '💤 Offline'}\n`
      + `💻 Kompyuter: ${store.isOnline ? '✅' : '💤'}\n`
      + `🕐 ${formatDate(store.lastSeen)}\n`
      + `🌤 Joy: ${loc ? loc.name || `${loc.lat},${loc.lon}` : '—'}`,
      { ...mainKb, parse_mode: 'Markdown' }
    )
  })

  bot.hears('🗑 Clear', async (ctx) => {
    store.clearUserHistory(ctx.from.id)
    await ctx.reply('✅ Tarix tozalandi', mainKb)
  })

  bot.hears('❓ Help', async (ctx) => {
    await ctx.reply(
      '🤖 *WILD AI Bot*\n\n'
      + '💬 *Chat* — Nemotron 3 Ultra (WILD suhbat + web qidiruv)\n'
      + '💻 *Code* — North Mini Code (kod yozish)\n'
      + '🖼 *Vision* — MiMo V2.5 (rasm tahlil)\n'
      + '📚 *Long* — Qwen3.6 Plus (katta kontekst)\n'
      + '🌤 *Weather* — ob-havo (location/shar)\n'
      + '⚡ *Agent* — Super AI Agent (istalgan soha bo\'yicha mutaxassis)\n'
      + '▶️ *Run* — kod bajarish (faqat Online)\n'
      + '📊 *Status* — bot holati\n'
      + '🗑 *Clear* — tarixni tozalash\n'
      + '🌤 Avtomatik ob-havo: 08:00 / 13:00\n\n'
      + '🔗 URL yuboring → bot o\'qib beradi\n'
      + '🌐 Har bir xabar web qidiruv bilan boyitiladi\n'
      + '💻 /onl = Komp rejimi  |  📱 /ofl = Telefon AI rejimi',
      { ...mainKb, parse_mode: 'Markdown' }
    )
  })

  bot.command('agent', async (ctx) => {
    const text = ctx.payload.trim()
    if (!text) return ctx.reply('/agent <matn>', mainKb)
    store.setUserPrompt(ctx.from.id, text)
    store.taskMode = 'agent'
    await ctx.reply(`✅ Agent ornatildi:\n\n${text}`, mainKb)
  })

  bot.command('reset_agent', async (ctx) => {
    store.resetUserPrompt(ctx.from.id)
    await ctx.reply('✅ Default agent ga qaytildi', mainKb)
  })

  bot.command('vibe', async (ctx) => {
    const text = ctx.payload.trim()
    if (!text) return ctx.reply('/vibe <matn> (eski nom — /agent bilan bir xil)', mainKb)
    store.setUserPrompt(ctx.from.id, text)
    store.taskMode = 'agent'
    await ctx.reply(`✅ Vibe ornatildi (Agent):\n\n${text}`, mainKb)
  })

  bot.command('reset_vibe', async (ctx) => {
    store.resetUserPrompt(ctx.from.id)
    await ctx.reply('✅ Default ga qaytildi', mainKb)
  })

  bot.command('run', async (ctx) => {
    if (store.mode !== 'online' || !store.isOnline) {
      return ctx.reply('💤 *Run* faqat Online rejimda ishlaydi. /onl', { ...mainKb, parse_mode: 'Markdown' })
    }

    const payload = ctx.payload.trim()
    const sep = payload.indexOf(' ')
    if (sep === -1) {
      return ctx.reply('Format: `/run <til> <kod>`\nMisol: `/run python print("salom")`', { ...mainKb, parse_mode: 'Markdown' })
    }

    const language = payload.slice(0, sep).trim().toLowerCase()
    const code = payload.slice(sep + 1).trim()
    if (!language || !code) {
      return ctx.reply('Format: `/run <til> <kod>`', { ...mainKb, parse_mode: 'Markdown' })
    }

    const client = getTunnelClient()
    if (!client) return ctx.reply('❌ Tunnel yo\'q', mainKb)
    if (!await client.health()) return ctx.reply('⚠️ Opencode serve javob bermayapti', mainKb)

    const langMap = { py: 'python3', js: 'node', javascript: 'node', cpp: 'g++', cs: 'csc', rb: 'ruby', rs: 'rustc', sh: 'bash', bash: 'bash' }
    const runner = langMap[language] || language

    const statusMsg = await ctx.reply(`⏳ ${language} da bajarilmoqda...`)
    try {
      const escCode = code.replace(/RUNEND/g, 'RUNEND2')
      const shellCmd = `${runner} << 'RUNEND'\n${escCode}\nRUNEND`
      const sessions = await client.listSessions()
      let shellId = sessions?.find(s => s.title === '__telegram-shell__')?.id
      if (!shellId) shellId = (await client.createSession('__telegram-shell__')).id
      const output = await client.runShell(shellId, shellCmd)
      const text = `▶️ *${language}*\n\`\`\`${language}\n${code.slice(0, 500)}\n\`\`\`\n\n📤 *Natija:*\n\`\`\`\n${(output || '✅').slice(0, 3000)}\n\`\`\``.slice(0, MAX_MSG)
      await ctx.telegram.editMessageText(ctx.chat.id, statusMsg.message_id, undefined, text, { parse_mode: 'Markdown' })
    } catch (e) {
      await ctx.telegram.editMessageText(ctx.chat.id, statusMsg.message_id, undefined, `❌ ${e.message}`.slice(0, MAX_MSG)).catch(() => {})
    }
  })

  bot.command('onl', async (ctx) => {
    if (!store.isOnline) return ctx.reply('💤 Kompyuter offline', mainKb)
    store.mode = 'online'
    updateKb()
    await ctx.reply('💻 *Komp rejimi* faollashtirildi\n\n▶️ Run — kod bajarish\n🔗 URL o\'qish\n💻 Shell komandalari', { ...mainKb, parse_mode: 'Markdown' })
  })

  bot.command('ofl', async (ctx) => {
    store.mode = 'offline'
    updateKb()
    await ctx.reply('📱 *Telefon AI rejimi*\n\nAI modellari + web qidiruv + ob-havo', { ...mainKb, parse_mode: 'Markdown' })
  })

  bot.command('clear', async (ctx) => {
    store.clearUserHistory(ctx.from.id)
    await ctx.reply('✅ Tarix tozalandi', mainKb)
  })

  bot.on('location', async (ctx) => {
    const { latitude, longitude } = ctx.message.location
    store.setUserLocation(ctx.from.id, { lat: latitude, lon: longitude, name: 'Sizning joy' })

    try {
      const w = await fetchWeatherByCoords(latitude, longitude)
      await ctx.reply(`🌤 *Sizning joyingiz*\n\n${w}`, { ...mainKb, parse_mode: 'Markdown' })
    } catch {
      await ctx.reply(`📍 Joylashuv saqlandi (${latitude}, ${longitude})`, mainKb)
    }

    if (store.taskMode !== 'weather') {
      store.taskMode = 'weather'
    }
  })

  bot.on('photo', async (ctx) => {
    try {
      store.taskMode = 'vision'
      store.resetUserPrompt(ctx.from.id)
      const photo = ctx.message.photo.pop()
      const link = await ctx.telegram.getFileLink(photo.file_id)
      const caption = ctx.message.caption || 'Bu rasmni tahlil qil'
      await processChat(ctx, caption, link.href)
    } catch (e) {
      await ctx.reply(`❌ ${e.message}`, mainKb)
    }
  })

  bot.on('text', async (ctx) => {
    const text = ctx.message.text.trim()
    if (text.startsWith('/')) return
    const buttons = ['💬 Chat', '💻 Code', '🖼 Vision', '📚 Long', '🌤 Weather', '⚡ Agent', '▶️ Run', '📊 Status', '🗑 Clear', '❓ Help']
    if (buttons.includes(text)) return

    const mode = store.taskMode

    if (mode === 'weather') {
      const urls = text.match(URL_REGEX)
      if (urls) return processChat(ctx, text)

      if (text.includes(',') && !isNaN(text.split(',')[0]) && !isNaN(text.split(',')[1])) {
        const [lat, lon] = text.split(',').map(Number)
        const w = await fetchWeatherByCoords(lat, lon).catch(() => null)
        if (w) {
          store.setUserLocation(ctx.from.id, { lat, lon, name: `${lat},${lon}` })
          return ctx.reply(`🌤 *${lat},${lon}*\n\n${w}`, { ...mainKb, parse_mode: 'Markdown' })
        }
      }

      try {
        const w = await fetchWeather(text)
        store.setUserLocation(ctx.from.id, { lat: 0, lon: 0, name: text })
        await ctx.reply(`🌤 *${text}*\n\n${w}`, { ...mainKb, parse_mode: 'Markdown' })
      } catch {
        await ctx.reply('❌ Ob-havo olinmadi. Shahar nomini to\'g\'ri yozing yoki location yuboring.', mainKb)
      }
      return
    }

    await processChat(ctx, text)
  })

  return bot
}
