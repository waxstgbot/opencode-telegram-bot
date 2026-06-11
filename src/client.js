export function createClient(baseUrl, password) {
  const auth = password
    ? 'Basic ' + Buffer.from(`opencode:${password}`).toString('base64')
    : ''

  const headers = { 'Content-Type': 'application/json' }
  if (auth) headers['Authorization'] = auth

  async function req(method, path, body) {
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`API ${res.status}: ${text.slice(0, 200)}`)
    }
    if (res.status === 204) return null
    return res.json()
  }

  return {
    async health() {
      try { await req('GET', '/'); return true }
      catch { return false }
    },
    async listSessions() { return req('GET', '/session') },
    async getSession(id) { return req('GET', `/session/${id}`) },
    async createSession(title) { return req('POST', '/session', { title: title || 'Telegram session' }) },
    async deleteSession(id) { await req('DELETE', `/session/${id}`) },
    async listMessages(sessionId) { return req('GET', `/session/${sessionId}/message`) },
    async runShell(sessionId, command) {
      const result = await req('POST', `/session/${sessionId}/shell`, { command, agent: 'general' })
      if (!result) return ''
      const parts = result.parts || []
      return parts.map(p => p.text || '').filter(Boolean).join('\n')
    },
  }
}

export function createGoClient(apiKey) {
  const BASE = 'https://opencode.ai/zen/v1'

  return {
    async chat(model, messages, options = {}) {
      const body = {
        model,
        messages,
        stream: false,
        max_tokens: options.maxTokens || 1024,
      }
      if (options.temperature !== undefined) body.temperature = options.temperature

      const res = await fetch(`${BASE}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(120000),
      })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`Zen API ${res.status}: ${text.slice(0, 300)}`)
      }
      const data = await res.json()
      return data.choices?.[0]?.message?.content || ''
    },
  }
}

export function createGroqClient(apiKey) {
  const BASE = 'https://api.groq.com/openai/v1'

  return {
    async chat(model, messages, options = {}) {
      const body = {
        model,
        messages,
        stream: false,
        max_tokens: options.maxTokens || 1024,
      }
      if (options.temperature !== undefined) body.temperature = options.temperature

      const res = await fetch(`${BASE}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(120000),
      })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        const err = new Error(`Groq API ${res.status}: ${text.slice(0, 300)}`)
        err.status = res.status
        throw err
      }
      const data = await res.json()
      return data.choices?.[0]?.message?.content || ''
    },
  }
}

export function createDeepSeekClient(apiKey) {
  const BASE = 'https://api.deepseek.com'

  return {
    async chat(model, messages, options = {}) {
      const body = {
        model,
        messages,
        stream: false,
        max_tokens: options.maxTokens || 1024,
      }
      if (options.temperature !== undefined) body.temperature = options.temperature

      const res = await fetch(`${BASE}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(120000),
      })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        const err = new Error(`DeepSeek API ${res.status}: ${text.slice(0, 300)}`)
        err.status = res.status
        throw err
      }
      const data = await res.json()
      return data.choices?.[0]?.message?.content || ''
    },
  }
}

async function ft(url, ms = 10000) {
  const res = await fetch(url, { signal: AbortSignal.timeout(ms) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res
}

export async function fetchWeather(city) {
  const res = await ft(`https://wttr.in/${encodeURIComponent(city)}?format=%C+%t+%w+%h&m`, 8000)
  return (await res.text()).trim()
}

export async function fetchWeatherByCoords(lat, lon) {
  const res = await ft(`https://wttr.in/${lat},${lon}?format=%C+%t+%w+%h&m`, 8000)
  return (await res.text()).trim()
}

export async function fetchDocumentText(url, mime) {
  const res = await ft(url, 120000)
  const buf = Buffer.from(await res.arrayBuffer())

  if (mime === 'application/pdf' || url.endsWith('.pdf')) {
    const { PDFParse } = await import('pdf-parse')
    const parser = new PDFParse({ data: buf })
    const result = await parser.getText()
    await parser.destroy()
    return result.text.slice(0, 4000)
  }

  return buf.toString('utf8').slice(0, 4000)
}

const PIN_UA = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'

const PLATFORMS = {
  pinterest: {
    test: (url) => /pinterest\.(com|fr|de|es|it|jp|pt|ru|co\.uk|ca|com\.au)\/pin\//i.test(url) || /pin\.it\//i.test(url),
    download: async (url) => {
      const res = await fetch(url, { signal: AbortSignal.timeout(10000), headers: { 'User-Agent': PIN_UA } })
      const html = await res.text()

      const videoMatch = html.match(/"url"\s*:\s*"(https:\/\/v1\.pinimg\.com\/videos\/iht\/expMp4\/[^"]+\.mp4)"/)
      if (videoMatch) {
        const vres = await fetch(videoMatch[1], { signal: AbortSignal.timeout(30000) })
        const buf = Buffer.from(await vres.arrayBuffer())
        return { buffer: buf, ext: 'mp4', mime: 'video/mp4', filename: `pin_${Date.now()}.mp4`, type: 'video' }
      }

      const imgMatch = html.match(/https?:\/\/i\.pinimg\.com\/originals\/[a-f0-9]+\/[a-f0-9]+\/[a-f0-9]+\/[a-f0-9]+\.(?:jpg|jpeg|png|webp)/i)
      if (!imgMatch) throw new Error('Pinterest media topilmadi')
      const imgRes = await fetch(imgMatch[0], { signal: AbortSignal.timeout(15000) })
      const buf = Buffer.from(await imgRes.arrayBuffer())
      const ext = imgMatch[0].split('.').pop()
      return { buffer: buf, ext, mime: `image/${ext === 'jpg' ? 'jpeg' : ext}`, filename: `pin_${Date.now()}.${ext}`, type: 'image' }
    }
  }
}

export function detectPlatform(url) {
  for (const [name, p] of Object.entries(PLATFORMS)) {
    if (p.test(url)) return name
  }
  return null
}

export async function downloadFromPlatform(url, platform) {
  const p = PLATFORMS[platform]
  if (!p) throw new Error(`Platforma qo'llab-quvvatlanmaydi: ${platform}`)
  return p.download(url)
}

export async function fetchUrlText(url) {
  const res = await ft(url, 10000)
  const html = await res.text()
  const text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return text.slice(0, 5000)
}

export async function webSearch(query) {
  const parts = []

  const ddgHtmlPromise = (async () => {
    try {
      const res = await ft(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, 8000)
      const html = await res.text()
      const results = [...html.matchAll(/<a rel="nofollow" class="result__a" href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a class="result__snippet"[\s\S]*?>([\s\S]*?)<\/a>/g)]
      results.slice(0, 5).forEach(m => {
        const url = decodeURIComponent(m[1].replace(/^.*uddg=/, '').split('&')[0])
        const title = m[2].replace(/<[^>]+>/g, '').trim()
        const snippet = m[3].replace(/<[^>]+>/g, '').trim()
        if (title) parts.push(`• ${title}\n  ${url}\n  ${snippet.slice(0, 200)}`)
      })
    } catch {}
  })()

  const wikiEnPromise = (async () => {
    try {
      const res = await ft(
        `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=3`,
        5000
      )
      if (res.ok) {
        const data = await res.json()
        const results = data?.query?.search || []
        results.forEach(r => {
          const url = `https://en.wikipedia.org/wiki/${encodeURIComponent(r.title.replace(/ /g, '_'))}`
          parts.push(`• ${r.title}\n  ${url}\n  ${r.snippet.replace(/<[^>]+>/g, '').slice(0, 200)}`)
        })
      }
    } catch {}
  })()

  const wikiUzPromise = (async () => {
    try {
      const res = await ft(
        `https://uz.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=3`,
        5000
      )
      if (res.ok) {
        const data = await res.json()
        const results = data?.query?.search || []
        results.forEach(r => {
          const url = `https://uz.wikipedia.org/wiki/${encodeURIComponent(r.title.replace(/ /g, '_'))}`
          parts.push(`• ${r.title}\n  ${url}\n  ${r.snippet.replace(/<[^>]+>/g, '').slice(0, 200)}`)
        })
      }
    } catch {}
  })()

  await Promise.all([ddgHtmlPromise, wikiEnPromise, wikiUzPromise])

  if (parts.length > 0) {
    const result = parts.slice(0, 6).join('\n\n')
    console.log(`🌐 Web search OK: ${parts.length} results for "${query.slice(0, 50)}"`)
    return result
  }
  console.log(`🌐 Web search empty: no results for "${query.slice(0, 50)}"`)
  return null
}
