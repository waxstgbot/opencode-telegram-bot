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
  const url = `https://wttr.in/${encodeURIComponent(city)}?format=%C+%t+%w+%h&lang=uz&m`
  const res = await fetch(url, { timeout: 10000 })
  if (!res.ok) throw new Error(`Weather ${res.status}`)
  const text = await res.text()
  return text.trim()
}

export async function fetchWeatherByCoords(lat, lon) {
  const url = `https://wttr.in/${lat},${lon}?format=%C+%t+%w+%h&lang=uz&m`
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
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`
  const res = await fetch(url, { timeout: 10000 })
  if (!res.ok) throw new Error(`Search ${res.status}`)
  const data = await res.json()
  const results = []
  if (data.AbstractText) results.push(data.AbstractText)
  if (data.RelatedTopics) {
    data.RelatedTopics.slice(0, 5).forEach(t => {
      if (t.Text) results.push(t.Text)
      if (t.Topics) t.Topics.forEach(st => { if (st.Text) results.push(st.Text) })
    })
  }
  return results.length ? results.slice(0, 3).join('\n\n') : null
}
