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
