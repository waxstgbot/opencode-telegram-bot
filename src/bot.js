import { Telegraf } from 'telegraf'
import { createClient } from './client.js'
import { store } from './store.js'

const ALLOWED_USERS = process.env.ALLOWED_USERS?.split(',').map(Number) || []
const SHELL_SESSION_TITLE = '__telegram-shell__'

function auth(ctx, next) {
  if (ALLOWED_USERS.length && !ALLOWED_USERS.includes(ctx.from.id)) {
    console.log(`⛔ Blocked access from user ${ctx.from.id} (@${ctx.from.username || 'no-username'})`)
    return ctx.reply(
      '⛔ Ruxsat yo\'q\n\n'
        + `Sizning Telegram ID: ${ctx.from.id}\n`
        + 'Buni .env faylidagi ALLOWED_USERS ga qo\'shing.'
    )
  }
  return next()
}

function formatDate(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('uz-UZ')
}

export function createBot(token, opencodePassword) {
  const bot = new Telegraf(token)
  bot.use(auth)

  function getClient() {
    const url = store.tunnelUrl
    if (!url) return null
    return createClient(url, opencodePassword)
  }

  async function checkOnline(ctx) {
    const online = store.isOnline
    if (!online) {
      await ctx.reply('💤 Kompyuter offline. Uni yoging va start.sh ni ishga tushiring.')
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

  bot.start(async (ctx) => {
    const status = store.isOnline ? '✅ Online' : '💤 Offline'
    await ctx.reply(
      '🤖 Opencode Telegram Bot\n\n'
        + `Kompyuter: ${status}\n`
        + `Oxirgi ko\'rilgan: ${formatDate(store.lastSeen)}\n\n`
        + 'Komandalar:\n'
        + '/sessions — Sessionlar ro\'yxati\n'
        + '/session <id> — Session tafsilotlari\n'
        + '/new <xabar> — Yangi session + prompt\n'
        + '/prompt <id> <xabar> — Sessionga yozish\n'
        + '/shell <komanda> — Bash komanda bajarish\n'
        + '/del <id> — Sessionni o\'chirish\n'
        + '/status — Kompyuter holati\n'
        + '/help — Yordam'
    )
  })

  bot.help(async (ctx) => {
    await ctx.reply(
      '📚 Komandalar:\n\n'
        + '/sessions — barcha sessionlar\n'
        + '/session <id> — bitta session\n'
        + '/new <matn> — yangi session ochib prompt berish\n'
        + '/prompt <id> <matn> — mavjud sessionga yozish\n'
        + '/shell <komanda> — terminal komandasi\n'
        + '/del <id> — sessionni o\'chirish\n'
        + '/status — kompyuter va bot holati'
    )
  })

  bot.command('status', async (ctx) => {
    const online = store.isOnline
    const lines = [
      '🤖 Bot: ✅ ishlayapti',
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
