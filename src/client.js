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
      }
      if (options.temperature !== undefined) body.temperature = options.temperature
      if (options.maxTokens !== undefined) body.max_tokens = options.maxTokens

      const res = await fetch(`${BASE}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
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

export async function fetchWeather(city) {
  const url = `https://wttr.in/${encodeURIComponent(city)}?format=%C+%t+%w+%h&m`
  const res = await fetch(url, { timeout: 10000 })
  if (!res.ok) throw new Error(`Weather ${res.status}`)
  const text = await res.text()
  return text.trim()
}

export async function fetchWeatherByCoords(lat, lon) {
  const url = `https://wttr.in/${lat},${lon}?format=%C+%t+%w+%h&m`
  const res = await fetch(url, { timeout: 10000 })
  if (!res.ok) throw new Error(`Weather ${res.status}`)
  const text = await res.text()
  return text.trim()
}

export async function fetchUrlText(url) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15000)
  const res = await fetch(url, {
    signal: controller.signal,
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Bot)' },
  })
  clearTimeout(timer)
  if (!res.ok) throw new Error(`URL ${res.status}`)
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

  try {
    const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`
    const ddgRes = await fetch(ddgUrl, { timeout: 5000 })
    if (ddgRes.ok) {
      const ddgData = await ddgRes.json()
      if (ddgData.AbstractText) parts.push(ddgData.AbstractText)
      if (ddgData.RelatedTopics) {
        ddgData.RelatedTopics.slice(0, 5).forEach(t => {
          if (t.Text) parts.push(t.Text)
          if (t.Topics) t.Topics.forEach(st => { if (st.Text) parts.push(st.Text) })
        })
      }
    }
  } catch {}

  if (parts.length === 0) {
    try {
      const wikiUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=5`
      const wikiRes = await fetch(wikiUrl, { timeout: 5000 })
      if (wikiRes.ok) {
        const wikiData = await wikiRes.json()
        const results = wikiData?.query?.search || []
        results.slice(0, 3).forEach(r => {
          parts.push(`• ${r.title}: ${r.snippet.replace(/<[^>]+>/g, '').slice(0, 300)}`)
        })
      }
    } catch {}
  }

  return parts.length > 0 ? parts.slice(0, 5).join('\n\n') : null
}
