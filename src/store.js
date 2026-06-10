import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DB_PATH = join(__dirname, '..', 'data.json')

const defaults = {
  tunnelUrl: null,
  lastSeen: null,
  mode: 'offline',
  model: 'nemo',
  chatHistory: {},
}

let data = { ...defaults }

function load() {
  if (existsSync(DB_PATH)) {
    try {
      data = { ...defaults, ...JSON.parse(readFileSync(DB_PATH, 'utf8')) }
    } catch { data = { ...defaults } }
  } else {
    data = { ...defaults }
  }
}

function save() {
  writeFileSync(DB_PATH, JSON.stringify(data, null, 2))
}

load()

export const store = {
  get tunnelUrl() { return data.tunnelUrl },
  set tunnelUrl(v) { data.tunnelUrl = v; save() },

  get lastSeen() { return data.lastSeen },
  set lastSeen(v) { data.lastSeen = v; save() },

  get mode() { return data.mode },
  set mode(v) { data.mode = v; save() },

  get model() { return data.model },
  set model(v) { data.model = v; save() },

  get isOnline() {
    if (!data.lastSeen || !data.tunnelUrl) return false
    return Date.now() - data.lastSeen < 120_000
  },

  getModelName() {
    return data.model === 'mimo' ? 'mimo-v2.5' : 'deepseek-v4-flash'
  },

  getUserHistory(userId) {
    return data.chatHistory[userId] || []
  },

  addUserMessage(userId, role, content) {
    if (!data.chatHistory[userId]) {
      data.chatHistory[userId] = []
    }
    data.chatHistory[userId].push({ role, content })
    if (data.chatHistory[userId].length > 50) {
      data.chatHistory[userId] = data.chatHistory[userId].slice(-50)
    }
    save()
  },

  clearUserHistory(userId) {
    data.chatHistory[userId] = []
    save()
  },
}
