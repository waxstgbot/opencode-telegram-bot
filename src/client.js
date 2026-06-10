import { randomBytes } from 'crypto'

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

  function extractText(result) {
    if (!result) return ''
    const parts = result.parts || []
    return parts.map(p => p.text || '').filter(Boolean).join('\n')
  }

  return {
    async health() {
      try {
        await req('GET', '/')
        return true
      } catch { return false }
    },

    async listSessions() {
      return req('GET', '/session')
    },

    async getSession(id) {
      return req('GET', `/session/${id}`)
    },

    async createSession(title) {
      return req('POST', '/session', { title: title || 'Telegram session' })
    },

    async deleteSession(id) {
      await req('DELETE', `/session/${id}`)
    },

    async listMessages(sessionId) {
      return req('GET', `/session/${sessionId}/message`)
    },

    async sendPrompt(sessionId, message, agent) {
      const result = await req('POST', `/session/${sessionId}/message`, {
        parts: [{ type: 'user', text: message }],
        agent: agent || 'general',
      })
      return extractText(result)
    },

    async runShell(sessionId, command) {
      const result = await req('POST', `/session/${sessionId}/shell`, {
        command,
        agent: 'general',
      })
      return extractText(result)
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

async function retry(fn, maxRetries = 3, delay = 3000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn()
    } catch (e) {
      if (i === maxRetries - 1) throw e
      await new Promise(r => setTimeout(r, delay * (i + 1)))
    }
  }
}

export function createGenClient() {
  return {
    async pollinations(prompt) {
      return retry(async () => {
        const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1024&height=1024&nologo=true&seed=${Math.floor(Math.random() * 100000)}`
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 60000)
        const res = await fetch(url, { signal: controller.signal })
        clearTimeout(timer)
        if (res.status === 402) throw new Error('Pollinations band (IP da 1 ta queue). 3 soniyada qayta uriniladi...')
        if (!res.ok) throw new Error(`Pollinations ${res.status}`)
        return Buffer.from(await res.arrayBuffer())
      })
    },

    async huggingFace(prompt, apiKey) {
      const res = await fetch('https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-dev', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ inputs: prompt }),
      })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`HuggingFace ${res.status}: ${text.slice(0, 200)}`)
      }
      return Buffer.from(await res.arrayBuffer())
    },

    async stability(prompt, apiKey) {
      const form = new FormData()
      form.append('prompt', prompt)
      form.append('output_format', 'png')
      const res = await fetch('https://api.stability.ai/v2beta/stable-image/generate/sd3', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Accept': 'image/*',
        },
        body: form,
      })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`Stability ${res.status}: ${text.slice(0, 200)}`)
      }
      return Buffer.from(await res.arrayBuffer())
    },
  }
}
