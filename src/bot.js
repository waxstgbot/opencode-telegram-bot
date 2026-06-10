import { Telegraf, Markup } from 'telegraf'
import { createClient, createGoClient } from './client.js'
import { store } from './store.js'

const ALLOWED_USERS = process.env.ALLOWED_USERS?.split(',').map(Number) || []
const SHELL_SESSION_TITLE = '__telegram-shell__'

const mainKb = Markup.keyboard([
  ['💬 Chat', '🔄 Model'],
  ['📡 Rejim', '📊 Status'],
  ['🗑 Clear', '❓ Help'],
]).resize()

function auth(ctx, next) {
  if (ALLOWED_USERS.length && !ALLOWED_USERS.includes(ctx.from.id)) {
    console.log(`⛔ Blocked access from user ${ctx.from.id} (@${ctx.from.username || 'no-username'})`)
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

  async function handleOnlineChat(ctx, text) {
    const client = await checkOnline(ctx)
    if (!client) return false

    const statusMsg = await ctx.reply('⏳ AI javob bermoqda...')
    try {
      const session = await getOrCreateUserSession(client, ctx.from.id)
      const reply = await client.sendPrompt(session.id, text)
      await ctx.telegram.editMessageText(
        ctx.chat.id, statusMsg.message_id, undefined,
        reply || '✅ Bajarildi'
      )
    } catch (e) {
      await ctx.telegram.editMessageText(
        ctx.chat.id, statusMsg.message_id, undefined,
        `❌ Xatolik: ${e.message}`
      )
    }
    return true
  }

  async function handleOfflineChat(ctx, text) {
    const statusMsg = await ctx.reply('⏳ AI javob bermoqda...')
    try {
      const history = store.getUserHistory(ctx.from.id)
      const messages = [
        { role: 'system', content: 'Sen yordamchi AI. Uzbek tilida gaplash.' },
        ...history,
        { role: 'user', content: text },
      ]
      const modelName = store.getModelName()
      const reply = await goClient.chat(modelName, messages)

      store.addUserMessage(ctx.from.id, 'user', text)
      store.addUserMessage(ctx.from.id, 'assistant', reply)

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
    return true
  }

  async function handleChat(ctx, text) {
    if (store.mode === 'online' && store.isOnline) {
      return handleOnlineChat(ctx, text)
    }
    return handleOfflineChat(ctx, text)
  }

  bot.start(async (ctx) => {
    const modeLabel = store.mode === 'online' ? '✅ Online' : '💤 Offline'
    const modelLabel = store.model === 'mimo' ? 'MiMo-V2.5 Free' : 'Nemotron 3 Ultra Free'
    await ctx.reply(
      '🤖 Opencode Telegram Bot\n\n'
        + `📡 Rejim: ${modeLabel}\n`
        + `🧠 Model: ${modelLabel}\n\n`
        + 'Tugmalardan foydalaning 👇',
      mainKb
    )
  })

  bot.hears('💬 Chat', async (ctx) => {
    await ctx.reply('✍️ Matn yozing...', Markup.removeKeyboard())
    await ctx.reply('AI ga yuborish uchun matn kiriting:', mainKb)
  })

  bot.hears('🔄 Model', async (ctx) => {
    const next = store.model === 'nemo' ? 'mimo' : 'nemo'
    store.model = next
    const label = next === 'mimo' ? 'MiMo-V2.5 Free' : 'Nemotron 3 Ultra Free'
    await ctx.reply(`🧠 Model: ${label}`, mainKb)
  })

  bot.hears('📡 Rejim', async (ctx) => {
    if (store.mode === 'online') {
      store.mode = 'offline'
      await ctx.reply('💤 Offline rejimga o\'tildi. AI chat orqali ishlaysiz.', mainKb)
    } else {
      if (!store.isOnline) {
        return ctx.reply('💤 Kompyuter offline. Avval laptopni yoging.', mainKb)
      }
      store.mode = 'online'
      await ctx.reply('✅ Online rejimga o\'tildi.', mainKb)
    }
  })

  bot.hears('📊 Status', async (ctx) => {
    const online = store.isOnline
    const modeLabel = store.mode === 'online' ? '✅ Online' : '💤 Offline'
    const modelLabel = store.model === 'mimo' ? 'MiMo-V2.5 Free' : 'Nemotron 3 Ultra Free'
    const lines = [
      '🤖 Bot: ✅ ishlayapti',
      `📡 Rejim: ${modeLabel}`,
      `🧠 Model: ${modelLabel}`,
      `💻 Kompyuter: ${online ? '✅ Online' : '💤 Offline'}`,
      `🕐 Oxirgi ko\'rilgan: ${formatDate(store.lastSeen)}`,
    ]
    if (online) {
      const client = getClient()
      if (client) {
        const alive = await client.health()
        lines.push(`🔗 Opencode serve: ${alive ? '✅' : '❌'}`)
      }
    }
    await ctx.reply(lines.join('\n'), mainKb)
  })

  bot.hears('🗑 Clear', async (ctx) => {
    store.clearUserHistory(ctx.from.id)
    await ctx.reply('✅ Chat tarixi tozalandi.', mainKb)
  })

  bot.hears('❓ Help', async (ctx) => {
    const lines = [
      '📚 Yordam:\n',
      '💬 Chat — AI ga matn yozish',
      '🔄 Model — Nemotron / MiMo almashtirish',
      '📡 Rejim — Online / Offline almashtirish',
      '📊 Status — Bot va kompyuter holati',
      '🗑 Clear — Chat tarixini tozalash\n',
      '⌨️ Komandalar:',
      '/chat <matn> — AI bilan suhbat',
      '/clear — Tarixni tozalash',
      '/onl — Online rejim',
      '/ofl — Offline rejim',
      '/mimo — MiMo-V2.5 Free',
      '/nemo — Nemotron 3 Ultra Free',
      '/status — Bot holati',
    ]
    await ctx.reply(lines.join('\n'), mainKb)
  })

  bot.command('status', async (ctx) => {
    const online = store.isOnline
    const modeLabel = store.mode === 'online' ? '✅ Online' : '💤 Offline'
    const modelLabel = store.model === 'mimo' ? 'MiMo-V2.5 Free' : 'Nemotron 3 Ultra Free'
    const lines = [
      '🤖 Bot: ✅ ishlayapti',
      `📡 Rejim: ${modeLabel}`,
      `🧠 Model: ${modelLabel}`,
      `💻 Kompyuter: ${online ? '✅ Online' : '💤 Offline'}`,
      `🕐 Oxirgi ko\'rilgan: ${formatDate(store.lastSeen)}`,
    ]
    if (online) {
      const client = getClient()
      if (client) {
        const alive = await client.health()
        lines.push(`🔗 Opencode serve: ${alive ? '✅' : '❌'}`)
      }
    }
    await ctx.reply(lines.join('\n'), mainKb)
  })

  bot.command('onl', async (ctx) => {
    if (!store.isOnline) {
      return ctx.reply('💤 Kompyuter offline. Avval laptopni yoging.', mainKb)
    }
    store.mode = 'online'
    await ctx.reply('✅ Online rejimga o\'tildi.', mainKb)
  })

  bot.command('ofl', async (ctx) => {
    store.mode = 'offline'
    await ctx.reply('💤 Offline rejimga o\'tildi.', mainKb)
  })

  bot.command('mimo', async (ctx) => {
    store.model = 'mimo'
    await ctx.reply('🧠 Model: MiMo-V2.5 Free (vision + text)', mainKb)
  })

  bot.command('nemo', async (ctx) => {
    store.model = 'nemo'
    await ctx.reply('🧠 Model: Nemotron 3 Ultra Free (text)', mainKb)
  })

  bot.command('clear', async (ctx) => {
    store.clearUserHistory(ctx.from.id)
    await ctx.reply('✅ Chat tarixi tozalandi.', mainKb)
  })

  bot.command('chat', async (ctx) => {
    const text = ctx.payload.trim()
    if (!text) return ctx.reply('Matn kiriting: /chat <matn>', mainKb)
    await handleChat(ctx, text)
  })

  bot.on('text', async (ctx) => {
    const text = ctx.message.text
    if (text.startsWith('/')) return
    if (['💬 Chat', '🔄 Model', '📡 Rejim', '📊 Status', '🗑 Clear', '❓ Help'].includes(text)) return
    await handleChat(ctx, text)
  })

  bot.command('sessions', async (ctx) => {
    const client = await checkOnline(ctx)
    if (!client) return

    try {
      const sessions = await client.listSessions()
      if (!sessions || sessions.length === 0) {
        return ctx.reply('📭 Hech qanday session yo\'q.', mainKb)
      }
      const maxShow = 15
      const list = sessions.slice(0, maxShow).map((s) =>
        `• ${s.title || 'nomsiz'} — \`${s.id}\``
      ).join('\n')
      await ctx.reply(
        `📋 Sessionlar (${sessions.length} ta):\n\n${list}`
          + (sessions.length > maxShow ? `\n...va yana ${sessions.length - maxShow} ta` : ''),
        { parse_mode: 'Markdown' }
      )
    } catch (e) {
      await ctx.reply(`❌ Xatolik: ${e.message}`, mainKb)
    }
  })

  bot.command('session', async (ctx) => {
    const id = ctx.payload.trim()
    if (!id) return ctx.reply('Session ID kiriting: /session <id>', mainKb)

    const client = await checkOnline(ctx)
    if (!client) return

    try {
      const s = await client.getSession(id)
      const msgs = await client.listMessages(id)
      const msgCount = msgs?.length || 0
      await ctx.reply(
        '📄 Session:\n'
          + `🆔 \`${s.id}\`\n`
          + `📌 ${s.title || 'nomsiz'}\n`
          + `💬 Xabarlar: ${msgCount} ta\n`
          + `📅 Yaratilgan: ${formatDate(s.created)}`,
        { parse_mode: 'Markdown' }
      )
    } catch (e) {
      await ctx.reply(`❌ Xatolik: ${e.message}`, mainKb)
    }
  })

  bot.command('new', async (ctx) => {
    const prompt = ctx.payload.trim()
    if (!prompt) return ctx.reply('Prompt kiriting: /new <prompt matni>', mainKb)

    const client = await checkOnline(ctx)
    if (!client) return

    const statusMsg = await ctx.reply('⏳ Yangi session yaratilmoqda...')
    try {
      const session = await client.createSession(prompt.slice(0, 80))
      const reply = await client.sendPrompt(session.id, prompt)
      await ctx.telegram.editMessageText(
        ctx.chat.id, statusMsg.message_id, undefined,
        `✅ Yaratildi: \`${session.id}\`\n\n${reply || 'Javob yo\'q'}`,
        { parse_mode: 'Markdown' }
      )
    } catch (e) {
      await ctx.telegram.editMessageText(
        ctx.chat.id, statusMsg.message_id, undefined,
        `❌ Xatolik: ${e.message}`
      )
    }
  })

  bot.command('prompt', async (ctx) => {
    const text = ctx.payload.trim()
    const space = text.indexOf(' ')
    if (space === -1) return ctx.reply('Format: /prompt <session_id> <xabar>', mainKb)

    const id = text.slice(0, space).trim()
    const message = text.slice(space + 1).trim()
    if (!id || !message) return ctx.reply('Format: /prompt <session_id> <xabar>', mainKb)

    const client = await checkOnline(ctx)
    if (!client) return

    const statusMsg = await ctx.reply('⏳ Javob kutilmoqda...')
    try {
      const reply = await client.sendPrompt(id, message)
      await ctx.telegram.editMessageText(
        ctx.chat.id, statusMsg.message_id, undefined,
        reply || '✅ Bajarildi',
      )
    } catch (e) {
      await ctx.telegram.editMessageText(
        ctx.chat.id, statusMsg.message_id, undefined,
        `❌ Xatolik: ${e.message}`
      )
    }
  })

  bot.command('shell', async (ctx) => {
    const command = ctx.payload.trim()
    if (!command) return ctx.reply('Komanda kiriting: /shell <komanda>', mainKb)

    const client = await checkOnline(ctx)
    if (!client) return

    const statusMsg = await ctx.reply('⏳ Bajarilmoqda...')
    try {
      const shellId = await getShellSessionId(client)
      const output = await client.runShell(shellId, command)
      const text = output || '✅ Bajarildi (chiqish yo\'q)'
      const truncated = text.length > 4000
        ? text.slice(0, 4000) + '\n\n... (davomi kesildi)'
        : text
      await ctx.telegram.editMessageText(
        ctx.chat.id, statusMsg.message_id, undefined,
        truncated
      )
    } catch (e) {
      await ctx.telegram.editMessageText(
        ctx.chat.id, statusMsg.message_id, undefined,
        `❌ Xatolik: ${e.message}`
      )
    }
  })

  bot.command('del', async (ctx) => {
    const id = ctx.payload.trim()
    if (!id) return ctx.reply('Session ID kiriting: /del <id>', mainKb)

    const client = await checkOnline(ctx)
    if (!client) return

    try {
      await client.deleteSession(id)
      await ctx.reply(`✅ O'chirildi: \`${id}\``, { parse_mode: 'Markdown' })
    } catch (e) {
      await ctx.reply(`❌ Xatolik: ${e.message}`, mainKb)
    }
  })

  return bot
}
