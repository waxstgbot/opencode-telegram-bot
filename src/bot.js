import { Telegraf } from 'telegraf'
import { createClient, createGoClient } from './client.js'
import { store } from './store.js'

const ALLOWED_USERS = process.env.ALLOWED_USERS?.split(',').map(Number) || []
const SHELL_SESSION_TITLE = '__telegram-shell__'

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
    const modelLabel = store.model === 'mimo' ? 'MiMo-V2.5' : 'DeepSeek V4 Flash'
    const online = store.isOnline
    await ctx.reply(
      '🤖 Opencode Telegram Bot\n\n'
        + `Rejim: ${modeLabel}\n`
        + `Model: ${modelLabel}\n`
        + `Kompyuter: ${online ? '✅ Online' : '💤 Offline'}\n\n`
        + 'Komandalar:\n'
        + '/chat <matn> — AI bilan suhbat\n'
        + '/clear — Tarixni tozalash\n'
        + '/onl — Online rejim\n'
        + '/ofl — Offline rejim\n'
        + '/mimo — MiMo-V2.5 modeli\n'
        + '/nemo — DeepSeek V4 Flash modeli\n'
        + '/status — Bot holati\n'
        + '/help — Yordam'
    )
  })

  bot.help(async (ctx) => {
    const lines = [
      '📚 Komandalar:\n',
      '/chat <matn> — AI bilan suhbat',
      '/clear — Chat tarixini tozalash',
      '/onl — Online rejimga o\'tish',
      '/ofl — Offline rejimga o\'tish',
      '/mimo — MiMo-V2.5 modeli (vision)',
      '/nemo — DeepSeek V4 Flash modeli (chat)',
      '/status — Bot va kompyuter holati\n',
    ]
    if (store.mode === 'online') {
      lines.push(
        '📋 Online rejim komandalari:',
        '/sessions — Sessionlar ro\'yxati',
        '/session <id> — Session tafsilotlari',
        '/new <matn> — Yangi session',
        '/prompt <id> <matn> — Sessionga yozish',
        '/shell <komanda> — Bash komanda',
        '/del <id> — Sessionni o\'chirish',
      )
    }
    await ctx.reply(lines.join('\n'))
  })

  bot.command('status', async (ctx) => {
    const online = store.isOnline
    const modeLabel = store.mode === 'online' ? '✅ Online' : '💤 Offline'
    const modelLabel = store.model === 'mimo' ? 'MiMo-V2.5' : 'DeepSeek V4 Flash'
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
    await ctx.reply(lines.join('\n'))
  })

  bot.command('onl', async (ctx) => {
    if (!store.isOnline) {
      return ctx.reply('💤 Kompyuter offline. Avval laptopni yoging va tunnel ulanishini o\'rnating.')
    }
    store.mode = 'online'
    await ctx.reply('✅ Online rejimga o\'tildi. Sessions va shell komandalari ishlaydi.')
  })

  bot.command('ofl', async (ctx) => {
    store.mode = 'offline'
    await ctx.reply('💤 Offline rejimga o\'tildi. AI chat OpenCode Go API orqali ishlaydi.')
  })

  bot.command('mimo', async (ctx) => {
    store.model = 'mimo'
    await ctx.reply('🧠 Model: MiMo-V2.5 (vision + text)')
  })

  bot.command('nemo', async (ctx) => {
    store.model = 'nemo'
    await ctx.reply('🧠 Model: DeepSeek V4 Flash (text)')
  })

  bot.command('clear', async (ctx) => {
    store.clearUserHistory(ctx.from.id)
    await ctx.reply('✅ Chat tarixi tozalandi.')
  })

  bot.command('chat', async (ctx) => {
    const text = ctx.payload.trim()
    if (!text) return ctx.reply('Matn kiriting: /chat <matn>')
    await handleChat(ctx, text)
  })

  bot.on('text', async (ctx) => {
    if (ctx.message.text.startsWith('/')) return
    await handleChat(ctx, ctx.message.text)
  })

  bot.command('sessions', async (ctx) => {
    const client = await checkOnline(ctx)
    if (!client) return

    try {
      const sessions = await client.listSessions()
      if (!sessions || sessions.length === 0) {
        return ctx.reply('📭 Hech qanday session yo\'q.')
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
      await ctx.reply(`❌ Xatolik: ${e.message}`)
    }
  })

  bot.command('session', async (ctx) => {
    const id = ctx.payload.trim()
    if (!id) return ctx.reply('Session ID kiriting: /session <id>')

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
      await ctx.reply(`❌ Xatolik: ${e.message}`)
    }
  })

  bot.command('new', async (ctx) => {
    const prompt = ctx.payload.trim()
    if (!prompt) return ctx.reply('Prompt kiriting: /new <prompt matni>')

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
    if (space === -1) return ctx.reply('Format: /prompt <session_id> <xabar>')

    const id = text.slice(0, space).trim()
    const message = text.slice(space + 1).trim()
    if (!id || !message) return ctx.reply('Format: /prompt <session_id> <xabar>')

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
    if (!command) return ctx.reply('Komanda kiriting: /shell <komanda>')

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
    if (!id) return ctx.reply('Session ID kiriting: /del <id>')

    const client = await checkOnline(ctx)
    if (!client) return

    try {
      await client.deleteSession(id)
      await ctx.reply(`✅ O'chirildi: \`${id}\``, { parse_mode: 'Markdown' })
    } catch (e) {
      await ctx.reply(`❌ Xatolik: ${e.message}`)
    }
  })

  return bot
}
