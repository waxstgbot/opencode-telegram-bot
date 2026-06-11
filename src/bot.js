import { Telegraf, Markup } from 'telegraf'
import { createClient, createGoClient, createGroqClient, createDeepSeekClient, fetchWeather, fetchWeatherByCoords, fetchUrlText, fetchDocumentText, webSearch, detectPlatform, downloadFromPlatform } from './client.js'
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

export function createBot(token, goApiKey, groqApiKey, deepSeekApiKey, opencodePassword) {
  const bot = new Telegraf(token, { handlerTimeout: 300_000 })
  bot.use(auth)

  bot.catch((err, ctx) => {
    console.error(`Bot error [${ctx?.updateType}]:`, err?.message || err)
    ctx?.reply(`❌ Xatolik: ${(err?.message || err).slice(0, 200)}`).catch(() => {})
  })

  const goClient = createGoClient(goApiKey)
  const groqClient = groqApiKey ? createGroqClient(groqApiKey) : null
  const deepSeekClient = deepSeekApiKey ? createDeepSeekClient(deepSeekApiKey) : null

  function getTunnelClient() {
    const url = store.tunnelUrl
    if (!url) return null
    return createClient(url, opencodePassword)
  }

  function updateKb() {
    mainKb = store.mode === 'online' && store.isOnline ? onlineKb : offlineKb
    return mainKb
  }

  async function chatWithFallback(model, messages, opts, skipGroq) {
    const errs = []
    const groqFast = 'llama-3.3-70b-versatile'
    const groqFallback = 'llama-3.1-8b-instant'
    const deepSeekModel = 'deepseek-v4-flash'

    if (groqClient && !skipGroq) {
      for (const gm of [groqFast, groqFallback]) {
        try {
          console.log(`🚀 Groq trying: ${gm}`)
          const r = await groqClient.chat(gm, messages, opts)
          console.log(`✅ Groq OK: ${gm}`)
          return r
        } catch (e) {
          errs.push(`Groq-${gm.split('-')[1] || gm}: ${e.message}`)
          console.error(`❌ Groq fail ${gm}: ${e.message}`)
          if (e.status !== 429) break
        }
      }
    }

    if (deepSeekClient) {
      try {
        console.log(`🚀 DeepSeek trying: ${deepSeekModel}`)
        const r = await deepSeekClient.chat(deepSeekModel, messages, opts)
        console.log(`✅ DeepSeek OK`)
        return r
      } catch (e) {
        errs.push(`DeepSeek: ${e.message}`)
        console.error(`❌ DeepSeek fail: ${e.message}`)
      }
    }

    try {
      return await goClient.chat(model, messages, opts)
    } catch (e) {
      errs.push(`Zen: ${e.message}`)
      throw new Error(errs.join(' | '))
    }
  }

  async function processChat(ctx, text, imageUrl, docText) {
    const model = store.getModelName()
    const mode = store.taskMode
    const systemPrompt = store.getSystemPrompt(ctx.from.id)
    const hasCustom = store.hasCustomPrompt(ctx.from.id)
    const history = store.getUserHistory(ctx.from.id)
    const urls = text.match(URL_REGEX)

    const statusMsg = await ctx.reply('⏳ ...')

    try {
      let extraContext = ''

      if (imageUrl) {
        const today = new Date().toISOString().split('T')[0]
        const messages = [
          { role: 'system', content: systemPrompt },
          { role: 'system', content: `Bugungi sana: ${today}` },
          { role: 'user', content: [
            { type: 'text', text: text || 'Bu rasmni tahlil qil' },
            { type: 'image_url', image_url: { url: imageUrl } },
          ]},
        ]
        const reply = await chatWithFallback(model, messages, { temperature: 0.9 }, true)
        await ctx.telegram.editMessageText(ctx.chat.id, statusMsg.message_id, undefined, (reply || '✅').slice(0, MAX_MSG))
        return
      }

      const today = new Date().toISOString().split('T')[0]

      if (urls && urls.length > 0 && !docText) {
        extraContext = 'Web sahifa kontenti (ASOSIY MANBA):\n'
        for (const url of urls.slice(0, 2)) {
          try {
            const content = await fetchUrlText(url)
            extraContext += `[${url}]:\n${content}\n\n`
          } catch (e) {
            extraContext += `[${url}]: yuklab bo\'lmadi (${e.message})\n\n`
          }
        }
      } else if (!hasCustom) {
        try {
          const searchResults = await webSearch(text)
          if (searchResults) {
            extraContext = 'Web qidiruv natijalari (ASOSIY MANBA — shu ma\'lumotlarni ishlat, o\'z bilimingni emas):\n' + searchResults
            console.log(`🌐 For user "${text.slice(0, 40)}..." using web results: ${searchResults.slice(0, 100)}...`)
          }
        } catch {}
      }

      const messages = [{ role: 'system', content: systemPrompt }]
      if (!hasCustom && !docText) {
        messages.push({ role: 'system', content: `Bugungi sana: ${today}.` })
      }
      messages.push(...history.filter(m => typeof m.content === 'string'))

      const searchPrefix = (extraContext && !docText)
        ? `Web qidiruv natijalari — MAJBURIY ISHLAT:\n${extraContext}\n\n---\n\n`
        : ''

      const userContent = docText
        ? `[HUJJAT KONTENTI]\n${docText}\n\n[FOYDALANUVCHI SAVOLI]\n${text}`
        : searchPrefix + text
      messages.push({ role: 'user', content: userContent })

      const temp = mode === 'agent' ? 0.7 : 0.9
      const reply = await chatWithFallback(model, messages, { temperature: temp })

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
    await ctx.reply(
      'WILD AI\n\n'
      + '💬 Chat — suhbat, savol-javob, web qidiruv\n'
      + '💻 Code — kod yozish, debug, exploit tahlil\n'
      + '🖼 Vision — rasm tahlil, matn oqish\n'
      + '📚 Long — katta kontekst, hujjat tahlil\n'
      + '🌤 Weather — ob-havo, avtomatik 08/13/19\n'
      + '⚡ Agent — istalgan kasb boyicha mutaxassis\n'
      + '▶️ Run — kod bajarish (Online)\n\n'
      + '📌 Pinterest  🔗 URL  📄 PDF/TXT\n'
      + '❓ Help — batafsil',
      mainKb
    )
  })

  bot.hears('💬 Chat', async (ctx) => {
    store.taskMode = 'chat'
    store.resetUserPrompt(ctx.from.id)
    store.clearUserHistory(ctx.from.id)
    await ctx.reply('💬 Chat — suhbat, savol-javob, web qidiruv, fayl tahlil\n'
      + 'Pinterest linki -> rasm yuklab beradi\n'
      + 'URL yuboring -> oqib beradi\n'
      + 'Matn yozing -> AI + web qidiruv',
      mainKb
    )
  })

  bot.hears('💻 Code', async (ctx) => {
    store.taskMode = 'code'
    store.resetUserPrompt(ctx.from.id)
    store.clearUserHistory(ctx.from.id)
    await ctx.reply('Code | North Mini Code Free\n\nKod yozish rejimi', mainKb)
  })

  bot.hears('🖼 Vision', async (ctx) => {
    store.taskMode = 'vision'
    store.resetUserPrompt(ctx.from.id)
    store.clearUserHistory(ctx.from.id)
    await ctx.reply('Vision | MiMo-V2.5 Free\n\nRasm yuboring, men tahlil qilaman', mainKb)
  })

  bot.hears('📚 Long', async (ctx) => {
    store.taskMode = 'long'
    store.resetUserPrompt(ctx.from.id)
    store.clearUserHistory(ctx.from.id)
    await ctx.reply('Long | Qwen3.6 Plus Free\n\nKatta kontekst rejimi', mainKb)
  })

  bot.hears('🌤 Weather', async (ctx) => {
    store.taskMode = 'weather'
    store.resetUserPrompt(ctx.from.id)
    store.clearUserHistory(ctx.from.id)
    const loc = store.getUserLocation(ctx.from.id)
    if (loc) {
      try {
        const w = await fetchWeatherByCoords(loc.lat, loc.lon)
        await ctx.reply(loc.name ? `🌤 ${loc.name}\n\n${w}\n\n🔄 Yangilash uchun location yuboring\n🏙 Shahar nomini yozing` : `🌤 Sizning joy\n\n${w}\n\n🔄 Yangilash uchun location yuboring\n🏙 Shahar nomini yozing`, mainKb)
      } catch {
        await ctx.reply('🌤 Ob-havo\n\nLocation yuboring yoki shahar nomini yozing', mainKb)
      }
    } else {
      await ctx.reply('🌤 Ob-havo\n\n📍 Location yuboring yoki\n🏙 Shahar nomini yozing\n\nMisol: Toshkent, London', mainKb)
    }
  })

  bot.hears('⚡ Agent', async (ctx) => {
    store.taskMode = 'agent'
    store.resetUserPrompt(ctx.from.id)
    store.clearUserHistory(ctx.from.id)
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
      return ctx.reply('Run faqat Online rejimda ishlaydi. /onl', mainKb)
    }
    await ctx.reply(
      'Run — kod bajarish\n\n'
      + 'Format: /run <til> <kod>\n\n'
      + 'Misol: /run python print("salom")\n'
      + 'Misol: /run js console.log(2+2)\n'
      + 'Misol: /run bash echo "test"\n\n'
      + 'Qollab-quvvatlanadi: python, js, cpp, rust, go, php, ruby, bash, java va 50+ til',
      mainKb
    )
  })

  bot.hears('📊 Status', async (ctx) => {
    const info = store.getModelInfo()
    const loc = store.getUserLocation(ctx.from.id)
    await ctx.reply(
      'Bot Status\n'
      + `Bot: ✅\n`
      + `Model: ${info.label}\n`
      + `Rejim: ${store.taskMode.toUpperCase()}\n`
      + `${store.mode === 'online' ? 'Online: ✅' : 'Online: 💤'}\n`
      + `Kompyuter: ${store.isOnline ? '✅' : '💤'}\n`
      + `${formatDate(store.lastSeen)}\n`
      + `Joy: ${loc ? loc.name || `${loc.lat},${loc.lon}` : '—'}`,
      mainKb
    )
  })

  bot.hears('🗑 Clear', async (ctx) => {
    store.clearUserHistory(ctx.from.id)
    await ctx.reply('✅ Tarix tozalandi', mainKb)
  })

  bot.hears('❓ Help', async (ctx) => {
    await ctx.reply(
      'WILD AI Bot\n\n'
      + '💬 Chat — suhbat, savol-javob, web qidiruv, fayl tahlil\n'
      + '💻 Code — kod yozish, debug qilish, refactor, exploit tahlil\n'
      + '🖼 Vision — rasm tahlil, matn oqish, diagramma, grafika\n'
      + '📚 Long — katta kontekst, hujjat tahlil, malumot extract\n'
      + '🌤 Weather — ob-havo (location yoki shahar nomi)\n'
      + '⚡ Agent — istalgan kasb boyicha super mutaxassis\n'
      + '▶️ Run — kod bajarish (faqat Online rejim)\n'
      + '📊 Status — bot va kompyuter holati\n'
      + '🗑 Clear — suhbat tarixini tozalash\n'
      + '🌤 Avtomatik ob-havo: 08:00 / 13:00 / 19:00\n'
      + '🏙 /w shahar — ob-havo shahrini ozgartirish\n\n'
      + '📌 Pinterest linki -> rasm/video yuklab beradi\n'
      + '🔗 URL yuboring -> bot oqib beradi\n'
      + '📄 Fayl yuboring -> PDF/TXT/JSON/CSV tahlil\n'
      + '🌐 Har bir xabar web qidiruv bilan boyitiladi\n'
      + '💻 /onl = Komp rejimi  |  📱 /ofl = Telefon AI rejimi',
      mainKb
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

  bot.command('w', async (ctx) => {
    const text = ctx.payload.trim()
    if (!text) return ctx.reply('/w <shahar nomi> — ob-havo joylashuvini almashtirish', mainKb)
    store.setUserLocation(ctx.from.id, { lat: 0, lon: 0, name: text })
    await ctx.reply(`✅ Joylashuv almashtirildi: ${text}\n🌤 Weather tugmasini bosing yoki matn yozing`, mainKb)
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
      return ctx.reply('Run faqat Online rejimda ishlaydi. /onl', mainKb)
    }

    const payload = ctx.payload.trim()
    const sep = payload.indexOf(' ')
    if (sep === -1) {
      return ctx.reply('Format: /run <til> <kod>\nMisol: /run python print("salom")', mainKb)
    }

    const language = payload.slice(0, sep).trim().toLowerCase()
    const code = payload.slice(sep + 1).trim()
    if (!language || !code) {
      return ctx.reply('Format: /run <til> <kod>', mainKb)
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
      const text = `[${language}]\n${code.slice(0, 500)}\n\nNatija:\n${(output || '✅').slice(0, 3000)}`.slice(0, MAX_MSG)
      await ctx.telegram.editMessageText(ctx.chat.id, statusMsg.message_id, undefined, text)
    } catch (e) {
      await ctx.telegram.editMessageText(ctx.chat.id, statusMsg.message_id, undefined, `❌ ${e.message}`.slice(0, MAX_MSG)).catch(() => {})
    }
  })

  bot.command('onl', async (ctx) => {
    if (!store.isOnline) return ctx.reply('Kompyuter offline', mainKb)
    store.mode = 'online'
    updateKb()
    await ctx.reply('Komp rejimi faollashtirildi\n\nRun — kod bajarish\nURL oqish\nShell komandalari', mainKb)
  })

  bot.command('ofl', async (ctx) => {
    store.mode = 'offline'
    updateKb()
    await ctx.reply('Telefon AI rejimi\n\nAI modellari + web qidiruv + ob-havo', mainKb)
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
      await ctx.reply(`🌤 Sizning joyingiz\n\n${w}`, mainKb)
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

  bot.on('document', async (ctx) => {
    const doc = ctx.message.document
    const supportedMimes = ['application/pdf', 'text/plain', 'text/html', 'application/json', 'text/csv']
    const isText = doc.mime_type && supportedMimes.includes(doc.mime_type)
    const isPdf = doc.mime_type === 'application/pdf' || doc.file_name?.endsWith('.pdf')

    if (!isText && !isPdf) {
      return ctx.reply(`❌ Qo'llab-quvvatlanmaydigan fayl: ${doc.mime_type || doc.file_name}\n\nFaqat: PDF, TXT, HTML, JSON, CSV`, mainKb)
    }

    if (doc.file_size > 10_000_000) {
      return ctx.reply('❌ Fayl hajmi 10 MB dan katta. Kichikroq fayl yuboring.')
    }

    const statusMsg = await ctx.reply('⏳ Fayl yuklanmoqda...')
    try {
      const link = await ctx.telegram.getFileLink(doc.file_id)
      const docText = await fetchDocumentText(link.href, doc.mime_type)

      store.clearUserHistory(ctx.from.id)
      store.taskMode = 'chat'
      await ctx.telegram.editMessageText(ctx.chat.id, statusMsg.message_id, undefined, '⏳ Tahlil qilinmoqda...')
      await processChat(ctx, ctx.message.caption || 'Bu faylni tahlil qil', null, docText)
    } catch (e) {
      await ctx.telegram.editMessageText(ctx.chat.id, statusMsg.message_id, undefined, `❌ ${e.message}`.slice(0, MAX_MSG)).catch(() => {})
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
          return ctx.reply(`🌤 ${lat},${lon}\n\n${w}`, mainKb)
        }
      }

      try {
        const w = await fetchWeather(text)
        store.setUserLocation(ctx.from.id, { lat: 0, lon: 0, name: text })
        await ctx.reply(`🌤 ${text}\n\n${w}`, mainKb)
      } catch {
        await ctx.reply('❌ Ob-havo olinmadi. Shahar nomini to\'g\'ri yozing yoki location yuboring.', mainKb)
      }
      return
    }

    const urls = text.match(URL_REGEX)
    if (urls) {
      for (const url of urls) {
        const platform = detectPlatform(url)
        if (platform) {
          try {
            const file = await downloadFromPlatform(url, platform)
            if (file.type === 'video') {
              await ctx.replyWithVideo({ source: file.buffer }, { caption: '📌 Pinterest' })
            } else if (['jpg','jpeg','png','webp'].includes(file.ext)) {
              await ctx.replyWithPhoto({ source: file.buffer }, { caption: '📌 Pinterest' })
            } else {
              await ctx.replyWithDocument({ source: file.buffer, filename: file.filename }, { caption: '📌 Pinterest' })
            }
          } catch (e) {
            await ctx.reply(`❌ Yuklab bo'lmadi: ${e.message}`)
          }
          return
        }
      }
    }

    await processChat(ctx, text)
  })

  return bot
}
