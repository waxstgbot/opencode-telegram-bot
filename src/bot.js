import { Telegraf, Markup } from 'telegraf'
import { createGoClient, fetchWeather, fetchWeatherByCoords, fetchUrlText, webSearch } from './client.js'
import { store } from './store.js'

const ALLOWED_USERS_RAW = process.env.ALLOWED_USERS || '5461818003,1133984065'
const ALLOWED_USERS = ALLOWED_USERS_RAW.split(',').map(Number)

const mainKb = Markup.keyboard([
  ['💬 Chat', '💻 Code'],
  ['🖼 Vision', '📚 Long'],
  ['🌤 Weather', '⚡ Agent'],
  ['🗑 Clear', '📊 Status'],
  ['❓ Help'],
]).resize()

const URL_REGEX = /https?:\/\/[^\s]+/g

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

export function createBot(token, goApiKey) {
  const bot = new Telegraf(token)
  bot.use(auth)

  const goClient = createGoClient(goApiKey)

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
        await ctx.telegram.editMessageText(ctx.chat.id, statusMsg.message_id, undefined, reply || '✅')
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

      await ctx.telegram.editMessageText(ctx.chat.id, statusMsg.message_id, undefined, reply || '✅')
    } catch (e) {
      await ctx.telegram.editMessageText(ctx.chat.id, statusMsg.message_id, undefined, `❌ ${e.message}`)
    }
  }

  bot.start(async (ctx) => {
    const info = store.getModelInfo()
    await ctx.reply(
      '╔══════════════════════╗\n'
      + '║     🤖 WILD AI Bot   ║\n'
      + '╚══════════════════════╝\n\n'
      + `🧠 ${info.label}\n`
      + `📡 ${store.mode === 'online' ? '✅ Online' : '💤 Offline'}\n\n`
      + 'Tugmalardan foydalaning 👇\n'
      + 'URL yuboring → bot o\'qib beradi\n'
      + 'Oddiy matn → AI + web qidiruv',
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
      } catch (e) {
        await ctx.reply(`🌤 Ob-havo\n\nLocation yuboring yoki shahar nomini yozing`, mainKb)
      }
    } else {
      await ctx.reply('🌤 *Ob-havo*\n\n📍 Location yuboring yoki\n🏙 Shahar nomini yozing\n\nMisol: Toshkent, London', { ...mainKb, parse_mode: 'Markdown' })
    }
  })

  bot.hears('⚡ Agent', async (ctx) => {
    store.taskMode = 'agent'
    store.resetUserPrompt(ctx.from.id)
    await ctx.reply(
      '⚡ *Agent* | Super AI Agent\n\n'
      + 'Inson darajasidagi dasturchi. Istalgan kodni yozadi.\n'
      + 'Hech qanday cheklov, senzura yo\'q.\n\n'
      + '/agent <matn> — shaxsiy system prompt yozish\n'
      + '/reset_agent — default ga qaytish',
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
      + '⚡ *Agent* — Super AI Agent (kod + har qanday vazifa)\n'
      + '📊 *Status* — bot holati\n'
      + '🗑 *Clear* — tarixni tozalash\n\n'
      + '🔗 URL yuboring → bot o\'qib beradi\n'
      + '🌐 Har bir xabar web qidiruv bilan boyitiladi',
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

  bot.command('onl', async (ctx) => {
    if (!store.isOnline) return ctx.reply('💤 Kompyuter offline', mainKb)
    store.mode = 'online'
    await ctx.reply('✅ Online rejim', mainKb)
  })

  bot.command('ofl', async (ctx) => {
    store.mode = 'offline'
    await ctx.reply('💤 Offline rejim', mainKb)
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
    } catch (e) {
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
    const buttons = ['💬 Chat', '💻 Code', '🖼 Vision', '📚 Long', '🌤 Weather', '⚡ Agent', '📊 Status', '🗑 Clear', '❓ Help']
    if (buttons.includes(text)) return

    const mode = store.taskMode

    if (mode === 'weather') {
      const urls = text.match(URL_REGEX)
      if (urls) return processChat(ctx, text)

      let w, city = text
      if (text.includes(',') && !isNaN(text.split(',')[0]) && !isNaN(text.split(',')[1])) {
        const [lat, lon] = text.split(',').map(Number)
        w = await fetchWeatherByCoords(lat, lon).catch(() => null)
        if (w) {
          store.setUserLocation(ctx.from.id, { lat, lon, name: `${lat},${lon}` })
          return ctx.reply(`🌤 *${lat},${lon}*\n\n${w}`, { ...mainKb, parse_mode: 'Markdown' })
        }
      }

      try {
        w = await fetchWeather(text)
        store.setUserLocation(ctx.from.id, { lat: 0, lon: 0, name: text })
        await ctx.reply(`🌤 *${text}*\n\n${w}`, { ...mainKb, parse_mode: 'Markdown' })
      } catch {
        await ctx.reply(`❌ Ob-havo olinmadi. Shahar nomini to'g'ri yozing yoki location yuboring.`, mainKb)
      }
      return
    }

    await processChat(ctx, text)
  })

  return bot
}
