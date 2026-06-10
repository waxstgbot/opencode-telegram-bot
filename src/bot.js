import { Telegraf, Markup } from 'telegraf'
import { createClient, createGoClient } from './client.js'
import { store } from './store.js'

const ALLOWED_USERS_RAW = process.env.ALLOWED_USERS || '5461818003,1133984065'
const ALLOWED_USERS = ALLOWED_USERS_RAW.split(',').map(Number)
const SHELL_SESSION_TITLE = '__telegram-shell__'

const mainKb = Markup.keyboard([
  ['💬 Chat', '💻 Code', '🖼 Vision'],
  ['📚 Long', '🎯 Vibe', '📊 Status'],
  ['🗑 Clear', '❓ Help'],
]).resize()

function auth(ctx, next) {
  if (ALLOWED_USERS.length && !ALLOWED_USERS.includes(ctx.from.id)) {
    console.log(`⛔ Blocked access from user ${ctx.from.id}`)
    return ctx.reply(
      '⛔ Ruxsat yo\'q\n\n'
        + `Sizning Telegram ID: ${ctx.from.id}\n`
        + 'Buni ALLOWED_USERS ga qo\'shing.'
    )
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

export function createBot(token, opencodePassword, goApiKey) {
  const bot = new Telegraf(token)
  bot.use(auth)

  const goClient = createGoClient(goApiKey)

  function getClient() {
    const url = store.tunnelUrl
    if (!url) return null
    return createClient(url, opencodePassword)
  }

  async function checkOnline(ctx) {
    const online = store.isOnline
    if (!online) {
      await ctx.reply('💤 Kompyuter offline.')
      return null
    }
    const client = getClient()
    if (!client) {
      await ctx.reply('❌ Tunnel URL topilmadi.')
      return null
    }
    const alive = await client.health()
    if (!alive) {
      await ctx.reply('⚠️ Kompyuter online lekin opencode serve javob bermayapti.')
      return null
    }
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
    const mode = store.mode
    const taskMode = store.taskMode

    if (mode === 'online' && store.isOnline && !imageUrl) {
      const client = await checkOnline(ctx)
      if (client) {
        try {
          const statusMsg = await ctx.reply('⏳ ...')
          const session = await getOrCreateUserSession(client, ctx.from.id)
          const reply = await client.sendPrompt(session.id, text)
          await ctx.telegram.editMessageText(
            ctx.chat.id, statusMsg.message_id, undefined,
            reply || '✅ Bajarildi'
          )
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

      let userContent
      if (imageUrl) {
        userContent = imageContent(text || 'Bu rasmni tahlil qil', imageUrl)
      } else {
        userContent = textContent(text)
      }

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

      await ctx.telegram.editMessageText(
        ctx.chat.id, statusMsg.message_id, undefined,
        reply || '✅ Javob yo\'q'
      )
    } catch (e) {
      await ctx.telegram.editMessageText(
        ctx.chat.id, statusMsg.message_id, undefined,
        `❌ Xatolik: ${e.message}`
      )
    }
  }

  function setTaskMode(ctx, mode) {
    store.taskMode = mode
    const info = store.getModelInfo()
    const sysPrompt = store.getSystemPrompt(ctx.from.id)
    store.resetUserPrompt(ctx.from.id)
    return `🧠 ${info.label}\n📝 Rejim: ${mode}\n\n${sysPrompt}`
  }

  bot.start(async (ctx) => {
    const info = store.getModelInfo()
    await ctx.reply(
      '🤖 WILD AI Bot\n\n'
        + `🧠 ${info.label}\n`
        + `📡 ${store.mode === 'online' ? '✅ Online' : '💤 Offline'}\n\n`
        + 'Tugmalardan foydalaning 👇\n'
        + 'Har qanday matn → AI ga ketadi',
      mainKb
    )
  })

  bot.hears('💬 Chat', async (ctx) => {
    store.taskMode = 'chat'
    store.resetUserPrompt(ctx.from.id)
    await ctx.reply(setTaskMode(ctx, 'chat'), mainKb)
  })

  bot.hears('💻 Code', async (ctx) => {
    store.taskMode = 'code'
    store.resetUserPrompt(ctx.from.id)
    await ctx.reply(setTaskMode(ctx, 'code'), mainKb)
  })

  bot.hears('🖼 Vision', async (ctx) => {
    store.taskMode = 'vision'
    store.resetUserPrompt(ctx.from.id)
    await ctx.reply(setTaskMode(ctx, 'vision') + '\n\nRasm yuboring, men tahlil qilaman.', mainKb)
  })

  bot.hears('📚 Long', async (ctx) => {
    store.taskMode = 'long'
    store.resetUserPrompt(ctx.from.id)
    await ctx.reply(setTaskMode(ctx, 'long'), mainKb)
  })

  bot.hears('🎯 Vibe', async (ctx) => {
    await ctx.reply(
      '🎯 Vibe sozlamalari:\n\n'
        + 'Yangi system prompt yozing yoki default ga qaytish uchun /reset_vibe',
      mainKb
    )
  })

  bot.hears('📊 Status', async (ctx) => {
    const info = store.getModelInfo()
    const taskMode = store.taskMode
    const lines = [
      '📊 Bot Status',
      `🤖 Bot: ✅ ishlayapti`,
      `🧠 Model: ${info.label}`,
      `📝 Rejim: ${taskMode}`,
      `📡 ${store.mode === 'online' ? '✅ Online' : '💤 Offline'}`,
      `💻 Kompyuter: ${store.isOnline ? '✅ Online' : '💤 Offline'}`,
      `🕐 Oxirgi: ${formatDate(store.lastSeen)}`,
    ]
    await ctx.reply(lines.join('\n'), mainKb)
  })

  bot.hears('🗑 Clear', async (ctx) => {
    store.clearUserHistory(ctx.from.id)
    await ctx.reply('✅ Tarix tozalandi.', mainKb)
  })

  bot.hears('❓ Help', async (ctx) => {
    await ctx.reply(
      '🤖 WILD AI Bot\n\n'
        + '💬 Chat — Nemotron 3 Ultra: WILD suhbat\n'
        + '💻 Code — North Mini Code: kod yozish\n'
        + '🖼 Vision — MiMo V2.5: rasm tahlil\n'
        + '📚 Long — Qwen3.6 Plus: katta kontekst\n'
        + '🎯 Vibe — shaxsiy system prompt\n'
        + '📊 Status — bot holati\n'
        + '🗑 Clear — tarixni tozalash\n\n'
        + 'Komandalar:\n'
        + '/vibe <matn> — system prompt o\'zgartirish\n'
        + '/reset_vibe — default prompt ga qaytish\n'
        + '/onl — online rejim\n'
        + '/ofl — offline rejim\n'
        + '/status — bot holati',
      mainKb
    )
  })

  bot.command('vibe', async (ctx) => {
    const text = ctx.payload.trim()
    if (!text) return ctx.reply('Yozing: /vibe <sizning system prompt>', mainKb)
    store.setUserPrompt(ctx.from.id, text)
    await ctx.reply(`✅ Yangi vibe o\'rnatildi:\n\n${text}`, mainKb)
  })

  bot.command('reset_vibe', async (ctx) => {
    store.resetUserPrompt(ctx.from.id)
    const sys = store.getSystemPrompt(ctx.from.id)
    await ctx.reply(`✅ Default vibe ga qaytildi:\n\n${sys}`, mainKb)
  })

  bot.command('status', async (ctx) => {
    const info = store.getModelInfo()
    const lines = [
      '📊 Bot Status',
      `🤖 Bot: ✅ ishlayapti`,
      `🧠 Model: ${info.label}`,
      `📝 Rejim: ${store.taskMode}`,
      `📡 ${store.mode === 'online' ? '✅ Online' : '💤 Offline'}`,
      `💻 Kompyuter: ${store.isOnline ? '✅ Online' : '💤 Offline'}`,
      `🕐 Oxirgi: ${formatDate(store.lastSeen)}`,
    ]
    await ctx.reply(lines.join('\n'), mainKb)
  })

  bot.command('onl', async (ctx) => {
    if (!store.isOnline) {
      return ctx.reply('💤 Kompyuter offline.', mainKb)
    }
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
    if (store.taskMode !== 'vision') {
      store.taskMode = 'vision'
      store.resetUserPrompt(ctx.from.id)
      await ctx.reply('🖼 Vision rejimga o\'tildi', mainKb)
    }
    try {
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
    const buttons = ['💬 Chat', '💻 Code', '🖼 Vision', '📚 Long', '🎯 Vibe', '📊 Status', '🗑 Clear', '❓ Help']
    if (buttons.includes(text)) return
    await processChat(ctx, text)
  })

  bot.command('sessions', async (ctx) => {
    const client = await checkOnline(ctx)
    if (!client) return
    try {
      const sessions = await client.listSessions()
      if (!sessions || sessions.length === 0) return ctx.reply('📭 Session yo\'q.', mainKb)
      const maxShow = 15
      const list = sessions.slice(0, maxShow).map(s =>
        `• ${s.title || 'nomsiz'} — \`${s.id}\``
      ).join('\n')
      await ctx.reply(
        `📋 Sessionlar (${sessions.length} ta):\n\n${list}`
          + (sessions.length > maxShow ? `\n...va yana ${sessions.length - maxShow} ta` : ''),
        { parse_mode: 'Markdown' }
      )
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
      await ctx.reply(
        `📄 Session: \`${s.id}\`\n📌 ${s.title || 'nomsiz'}\n💬 ${msgs?.length || 0} ta`,
        { parse_mode: 'Markdown' }
      )
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
      await ctx.telegram.editMessageText(
        ctx.chat.id, statusMsg.message_id, undefined,
        `✅ \`${session.id}\`\n\n${reply || ''}`,
        { parse_mode: 'Markdown' }
      )
    } catch (e) {
      await ctx.telegram.editMessageText(
        ctx.chat.id, statusMsg.message_id, undefined,
        `❌ ${e.message}`
      )
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
      await ctx.telegram.editMessageText(
        ctx.chat.id, statusMsg.message_id, undefined,
        reply || '✅'
      )
    } catch (e) {
      await ctx.telegram.editMessageText(
        ctx.chat.id, statusMsg.message_id, undefined,
        `❌ ${e.message}`
      )
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
      const truncated = text.length > 4000
        ? text.slice(0, 4000) + '\n\n...'
        : text
      await ctx.telegram.editMessageText(
        ctx.chat.id, statusMsg.message_id, undefined,
        truncated
      )
    } catch (e) {
      await ctx.telegram.editMessageText(
        ctx.chat.id, statusMsg.message_id, undefined,
        `❌ ${e.message}`
      )
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
