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
        max_tokens: options.maxTokens || 500,
      }
      if (options.temperature !== undefined) body.temperature = options.temperature

      const res = await fetch(`${BASE}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(45000),
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

  const tryFetch = async (url, parser) => {
    try {
      const res = await ft(url, 3000)
      if (res.ok) parser(await res.json())
    } catch {}
  }

  const ddgPromise = tryFetch(
    `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`,
    (data) => {
      if (data.AbstractText) parts.push(data.AbstractText)
      if (data.RelatedTopics) {
        data.RelatedTopics.slice(0, 5).forEach(t => {
          if (t.Text) parts.push(t.Text)
          if (t.Topics) t.Topics.forEach(st => { if (st.Text) parts.push(st.Text) })
        })
      }
    }
  )

  const wikiPromise = tryFetch(
    `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=3`,
    (data) => {
      const results = data?.query?.search || []
      results.forEach(r => {
        parts.push(`• ${r.title}: ${r.snippet.replace(/<[^>]+>/g, '').slice(0, 200)}`)
      })
    }
  )

  await Promise.all([ddgPromise, wikiPromise])

  return parts.length > 0 ? parts.slice(0, 4).join('\n\n') : null
}
