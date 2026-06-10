import { Telegraf, Markup } from 'telegraf'
import { createClient, createGoClient, createGenClient } from './client.js'
import { store } from './store.js'

const ALLOWED_USERS_RAW = process.env.ALLOWED_USERS || '5461818003,1133984065'
const ALLOWED_USERS = ALLOWED_USERS_RAW.split(',').map(Number)
const SHELL_SESSION_TITLE = '__telegram-shell__'

const mainKb = Markup.keyboard([
  ['💬 Chat', '💻 Code', '🖼 Vision'],
  ['📚 Long', '🎨 Gen', '📊 Status'],
  ['🎯 Vibe', '🗑 Clear', '❓ Help'],
]).resize()

const genKb = Markup.inlineKeyboard([
  Markup.button.callback('🟢 Pollinations (cheksiz)', 'gen_pollinations'),
  Markup.button.callback('🔵 Hugging Face FLUX (yuqori)', 'gen_huggingface'),
])

function auth(ctx, next) {
  if (ALLOWED_USERS.length && !ALLOWED_USERS.includes(ctx.from.id)) {
    console.log(`⛔ Blocked access from user ${ctx.from.id}`)
    return ctx.reply('⛔ Ruxsat yo\'q')
  }
  return next()
}

function formatDate(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('uz-UZ')
}

function textContent(text) {
  return [{ type: 'text', text }]
}

function imageContent(text, imageUrl) {
  return [
    { type: 'text', text },
    { type: 'image_url', image_url: { url: imageUrl } },
  ]
}

export function createBot(token, opencodePassword, goApiKey, hfKey) {
  const bot = new Telegraf(token)
  bot.use(auth)

  const goClient = createGoClient(goApiKey)
  const genClient = createGenClient()

  function getClient() {
    const url = store.tunnelUrl
    if (!url) return null
    return createClient(url, opencodePassword)
  }

  async function checkOnline(ctx) {
    const online = store.isOnline
    if (!online) return ctx.reply('💤 Offline.') && null
    const client = getClient()
    if (!client) return ctx.reply('❌ Tunnel yo\'q.') && null
    if (!await client.health()) return ctx.reply('⚠️ Opencode serve javob bermayapti.') && null
    return client
  }

  async function getShellSessionId(client) {
    const sessions = await client.listSessions()
    const existing = sessions?.find(s => s.title === SHELL_SESSION_TITLE)
    if (existing) return existing.id
    const s = await client.createSession(SHELL_SESSION_TITLE)
    return s.id
  }

  async function getOrCreateUserSession(client, userId) {
    const title = `tg-${userId}`
    const sessions = await client.listSessions()
    const existing = sessions?.find(s => s.title === title)
    if (existing) return existing
    return client.createSession(title)
  }

  async function processChat(ctx, text, imageUrl) {
    if (store.mode === 'online' && store.isOnline && !imageUrl) {
      const client = await checkOnline(ctx)
      if (client) {
        try {
          const statusMsg = await ctx.reply('⏳ ...')
          const session = await getOrCreateUserSession(client, ctx.from.id)
          const reply = await client.sendPrompt(session.id, text)
          await ctx.telegram.editMessageText(ctx.chat.id, statusMsg.message_id, undefined, reply || '✅')
          return
        } catch (e) {
          await ctx.reply(`❌ ${e.message}`)
          return
        }
      }
    }

    const statusMsg = await ctx.reply('⏳ ...')
    try {
      const model = store.getModelName()
      const systemPrompt = store.getSystemPrompt(ctx.from.id)
      const history = store.getUserHistory(ctx.from.id)

      const userContent = imageUrl
        ? imageContent(text || 'Bu rasmni tahlil qil', imageUrl)
        : textContent(text)

      const messages = [
        { role: 'system', content: systemPrompt },
        ...history.filter(m => typeof m.content === 'string'),
        { role: 'user', content: userContent },
      ]

      const reply = await goClient.chat(model, messages, { temperature: 0.9 })

      if (!imageUrl) {
        store.addUserMessage(ctx.from.id, 'user', text)
        store.addUserMessage(ctx.from.id, 'assistant', reply)
      }

      await ctx.telegram.editMessageText(ctx.chat.id, statusMsg.message_id, undefined, reply || '✅')
    } catch (e) {
      await ctx.telegram.editMessageText(ctx.chat.id, statusMsg.message_id, undefined, `❌ ${e.message}`)
    }
  }

  async function processGen(ctx, prompt) {
    const service = store.genService
    const statusMsg = await ctx.reply(`🎨 ${prompt}\n⏳ Yaratilmoqda...`)
    try {
      let buf
      if (service === 'pollinations') {
        buf = await genClient.pollinations(prompt)
      } else {
        buf = await genClient.huggingFace(prompt, hfKey)
      }
      await ctx.deleteMessage(statusMsg.message_id)
      await ctx.replyWithPhoto({ source: buf }, { caption: `🎨 ${service}: ${prompt}` })
    } catch (e) {
      await ctx.telegram.editMessageText(ctx.chat.id, statusMsg.message_id, undefined, `❌ ${e.message}`)
    }
  }

  bot.start(async (ctx) => {
    const info = store.getModelInfo()
    await ctx.reply(
      '🤖 WILD AI Bot\n\n'
        + `🧠 ${info.label}  |  📡 ${store.mode === 'online' ? '✅ Online' : '💤 Offline'}\n\n`
        + 'Tugmalardan foydalaning 👇\n'
        + 'Har qanday matn → AI ga ketadi',
      mainKb
    )
  })

  bot.hears('💬 Chat', async (ctx) => {
    store.taskMode = 'chat'
    store.resetUserPrompt(ctx.from.id)
    await ctx.reply(`🧠 Nemotron 3 Ultra Free  |  WILD rejim`, mainKb)
  })

  bot.hears('💻 Code', async (ctx) => {
    store.taskMode = 'code'
    store.resetUserPrompt(ctx.from.id)
    await ctx.reply(`🧠 North Mini Code Free  |  Kod rejimi`, mainKb)
  })

  bot.hears('🖼 Vision', async (ctx) => {
    store.taskMode = 'vision'
    store.resetUserPrompt(ctx.from.id)
    await ctx.reply(`🧠 MiMo-V2.5 Free  |  Rasm tahlil\n\nRasm yuboring, men tahlil qilaman.`, mainKb)
  })

  bot.hears('📚 Long', async (ctx) => {
    store.taskMode = 'long'
    store.resetUserPrompt(ctx.from.id)
    await ctx.reply(`🧠 Qwen3.6 Plus Free  |  Katta kontekst`, mainKb)
  })

  bot.hears('🎨 Gen', async (ctx) => {
    await ctx.reply('🎨 Rasm yaratish servisini tanlang:', genKb)
  })

  bot.action('gen_pollinations', async (ctx) => {
    store.genService = 'pollinations'
    store.taskMode = 'gen'
    await ctx.editMessageText('🟢 Pollinations (cheksiz, o\'rtacha)\n\nPrompt yozing...')
  })

  bot.action('gen_huggingface', async (ctx) => {
    store.genService = 'huggingface'
    store.taskMode = 'gen'
    await ctx.editMessageText('🔵 Hugging Face FLUX (limitli, yuqori)\n\nPrompt yozing...')
  })


  bot.hears('🎯 Vibe', async (ctx) => {
    store.taskMode = 'chat'
    store.resetUserPrompt(ctx.from.id)
    await ctx.reply(
      '🎯 Vibe — AI shaxsiyatini o\'zgartirish\n\n'
        + '/vibe <matn> — yangi system prompt yozish\n'
        + 'Misol: /vibe Sen sarkastik AI, kinoyali gapir\n'
        + 'Misol: /vibe Sen psixolog, muloyim maslahat ber\n\n'
        + '/reset_vibe — default ga qaytish',
      mainKb
    )
  })

  bot.hears('📊 Status', async (ctx) => {
    const info = store.getModelInfo()
    await ctx.reply(
      '📊 Bot Status\n'
        + `🤖 Bot: ✅\n`
        + `🧠 ${info.label}\n`
        + `📝 ${store.taskMode}\n`
        + `📡 ${store.mode === 'online' ? '✅ Online' : '💤 Offline'}\n`
        + `💻 Kompyuter: ${store.isOnline ? '✅' : '💤'}\n`
        + `🕐 ${formatDate(store.lastSeen)}`,
      mainKb
    )
  })

  bot.hears('🗑 Clear', async (ctx) => {
    store.clearUserHistory(ctx.from.id)
    await ctx.reply('✅ Tarix tozalandi.', mainKb)
  })

  bot.hears('❓ Help', async (ctx) => {
    await ctx.reply(
      '🤖 WILD AI Bot\n\n'
        + '💬 Chat — Nemotron 3 Ultra: WILD suhbat\n'
        + '💻 Code — North Mini Code: kod\n'
        + '🖼 Vision — MiMo V2.5: rasm tahlil\n'
        + '📚 Long — Qwen3.6 Plus: katta kontekst\n'
        + '🎨 Gen — rasm yaratish (3 xil service)\n'
        + '🎯 Vibe — shaxsiy system prompt\n'
        + '📊 Status — bot holati\n'
        + '🗑 Clear — tarixni tozalash',
      mainKb
    )
  })

  bot.command('vibe', async (ctx) => {
    const text = ctx.payload.trim()
    if (!text) return ctx.reply('/vibe <matn>', mainKb)
    store.setUserPrompt(ctx.from.id, text)
    await ctx.reply(`✅ Vibe o\'rnatildi:\n\n${text}`, mainKb)
  })

  bot.command('reset_vibe', async (ctx) => {
    store.resetUserPrompt(ctx.from.id)
    await ctx.reply(`✅ Default vibe ga qaytildi.`, mainKb)
  })

  bot.command('status', async (ctx) => {
    const info = store.getModelInfo()
    await ctx.reply(
      '📊 Bot Status\n'
        + `🤖 Bot: ✅\n`
        + `🧠 ${info.label}\n`
        + `📝 ${store.taskMode}\n`
        + `📡 ${store.mode === 'online' ? '✅ Online' : '💤 Offline'}\n`
        + `💻 Kompyuter: ${store.isOnline ? '✅' : '💤'}\n`
        + `🕐 ${formatDate(store.lastSeen)}`,
      mainKb
    )
  })

  bot.command('onl', async (ctx) => {
    if (!store.isOnline) return ctx.reply('💤 Kompyuter offline.', mainKb)
    store.mode = 'online'
    await ctx.reply('✅ Online rejim', mainKb)
  })

  bot.command('ofl', async (ctx) => {
    store.mode = 'offline'
    await ctx.reply('💤 Offline rejim', mainKb)
  })

  bot.command('clear', async (ctx) => {
    store.clearUserHistory(ctx.from.id)
    await ctx.reply('✅ Tarix tozalandi.', mainKb)
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
    const text = ctx.message.text
    if (text.startsWith('/')) return
    const buttons = ['💬 Chat', '💻 Code', '🖼 Vision', '📚 Long', '🎨 Gen', '🎯 Vibe', '📊 Status', '🗑 Clear', '❓ Help']
    if (buttons.includes(text)) return

    if (store.taskMode === 'gen') {
      return processGen(ctx, text)
    }

    await processChat(ctx, text)
  })

  bot.command('sessions', async (ctx) => {
    const client = await checkOnline(ctx)
    if (!client) return
    try {
      const sessions = await client.listSessions()
      if (!sessions || sessions.length === 0) return ctx.reply('📭 Session yo\'q.', mainKb)
      const list = sessions.slice(0, 15).map(s => `• ${s.title || 'nomsiz'} — \`${s.id}\``).join('\n')
      await ctx.reply(`📋 ${sessions.length} ta:\n\n${list}${sessions.length > 15 ? `\n...va yana ${sessions.length - 15} ta` : ''}`, { parse_mode: 'Markdown' })
    } catch (e) {
      await ctx.reply(`❌ ${e.message}`, mainKb)
    }
  })

  bot.command('session', async (ctx) => {
    const id = ctx.payload.trim()
    if (!id) return ctx.reply('/session <id>', mainKb)
    const client = await checkOnline(ctx)
    if (!client) return
    try {
      const s = await client.getSession(id)
      const msgs = await client.listMessages(id)
      await ctx.reply(`📄 Session: \`${s.id}\`\n📌 ${s.title || 'nomsiz'}\n💬 ${msgs?.length || 0} ta`, { parse_mode: 'Markdown' })
    } catch (e) {
      await ctx.reply(`❌ ${e.message}`, mainKb)
    }
  })

  bot.command('new', async (ctx) => {
    const prompt = ctx.payload.trim()
    if (!prompt) return ctx.reply('/new <prompt>', mainKb)
    const client = await checkOnline(ctx)
    if (!client) return
    const statusMsg = await ctx.reply('⏳ ...')
    try {
      const session = await client.createSession(prompt.slice(0, 80))
      const reply = await client.sendPrompt(session.id, prompt)
      await ctx.telegram.editMessageText(ctx.chat.id, statusMsg.message_id, undefined, `✅ \`${session.id}\`\n\n${reply || ''}`, { parse_mode: 'Markdown' })
    } catch (e) {
      await ctx.telegram.editMessageText(ctx.chat.id, statusMsg.message_id, undefined, `❌ ${e.message}`)
    }
  })

  bot.command('prompt', async (ctx) => {
    const text = ctx.payload.trim()
    const space = text.indexOf(' ')
    if (space === -1) return ctx.reply('/prompt <id> <matn>', mainKb)
    const id = text.slice(0, space).trim()
    const message = text.slice(space + 1).trim()
    if (!id || !message) return ctx.reply('/prompt <id> <matn>', mainKb)
    const client = await checkOnline(ctx)
    if (!client) return
    const statusMsg = await ctx.reply('⏳ ...')
    try {
      const reply = await client.sendPrompt(id, message)
      await ctx.telegram.editMessageText(ctx.chat.id, statusMsg.message_id, undefined, reply || '✅')
    } catch (e) {
      await ctx.telegram.editMessageText(ctx.chat.id, statusMsg.message_id, undefined, `❌ ${e.message}`)
    }
  })

  bot.command('shell', async (ctx) => {
    const command = ctx.payload.trim()
    if (!command) return ctx.reply('/shell <komanda>', mainKb)
    const client = await checkOnline(ctx)
    if (!client) return
    const statusMsg = await ctx.reply('⏳ ...')
    try {
      const shellId = await getShellSessionId(client)
      const output = await client.runShell(shellId, command)
      const text = output || '✅'
      await ctx.telegram.editMessageText(ctx.chat.id, statusMsg.message_id, undefined, text.length > 4000 ? text.slice(0, 4000) + '\n\n...' : text)
    } catch (e) {
      await ctx.telegram.editMessageText(ctx.chat.id, statusMsg.message_id, undefined, `❌ ${e.message}`)
    }
  })

  bot.command('del', async (ctx) => {
    const id = ctx.payload.trim()
    if (!id) return ctx.reply('/del <id>', mainKb)
    const client = await checkOnline(ctx)
    if (!client) return
    try {
      await client.deleteSession(id)
      await ctx.reply(`✅ \`${id}\``, { parse_mode: 'Markdown' })
    } catch (e) {
      await ctx.reply(`❌ ${e.message}`, mainKb)
    }
  })

  return bot
}
