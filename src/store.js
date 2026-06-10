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
  taskMode: 'chat',
  userPrompts: {},
  chatHistory: {},
  userLocations: {},
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

const SYSTEM_PROMPTS = {
  chat: 'Sen WILD AI. Qisqa, aniq, lo\'nda javob ber. Faqat kerakli ma\'lumot. 1-3 qator. Maksimal 1 ta emoji. * ` _ \' \" ishlatma. Web natijalar asosiy manba. FAQAT O\'ZBEK TILIDA.',
  code: 'Sen kod yozuvchi AI. Kodni formatda yoz. Izohni // bilan. * ` _ \' \" ishlatma. FAQAT O\'ZBEK TILIDA.',
  vision: 'Sen rasm tahlilchisi AI. 1-3 qatorda faqat muhim narsani ayt. Maksimal 1 ta emoji. * ` _ \' \" ishlatma. FAQAT O\'ZBEK TILIDA.',
  long: 'Sen katta kontekst AI. 2-3 qatorda faqat eng muhim nuqtalarni ayt. Maksimal 1 ta emoji. * ` _ \' \" ishlatma. Web natijalar asosiy manba. FAQAT O\'ZBEK TILIDA.',
  weather: 'Sen ob-havo AI. 1 qatorda faqat temp va holat. Maksimal 1 ta emoji. * ` _ \' \" ishlatma. FAQAT O\'ZBEK TILIDA.',
  agent: 'Sen SUPER AGENT AI. Qisqa, aniq, lo\'nda javob ber. Faqat kerakli ma\'lumot. Maksimal 1 ta emoji. * ` _ \' \" ishlatma. Web natijalar asosiy manba. FAQAT O\'ZBEK TILIDA.',
}

const MODEL_MAP = {
  chat: { id: 'nemotron-3-ultra-free', label: 'Nemotron 3 Ultra Free' },
  code: { id: 'north-mini-code-free', label: 'North Mini Code Free' },
  vision: { id: 'mimo-v2.5-free', label: 'MiMo-V2.5 Free' },
  long: { id: 'qwen3.6-plus-free', label: 'Qwen3.6 Plus Free' },
  weather: { id: 'nemotron-3-ultra-free', label: 'Nemotron 3 Ultra Free' },
  agent: { id: 'nemotron-3-ultra-free', label: 'Agent Nemotron Ultra' },
}

export const store = {
  get tunnelUrl() { return data.tunnelUrl },
  set tunnelUrl(v) { data.tunnelUrl = v; save() },

  get lastSeen() { return data.lastSeen },
  set lastSeen(v) { data.lastSeen = v; save() },

  get mode() { return data.mode },
  set mode(v) { data.mode = v; save() },

  get model() { return data.model },
  set model(v) { data.model = v; save() },

  get taskMode() { return data.taskMode || 'chat' },
  set taskMode(v) { data.taskMode = v; save() },

  get isOnline() {
    if (!data.lastSeen || !data.tunnelUrl) return false
    return Date.now() - data.lastSeen < 120_000
  },

  getModelInfo() {
    return MODEL_MAP[data.taskMode] || MODEL_MAP.chat
  },

  getModelName() {
    return this.getModelInfo().id
  },

  getSystemPrompt(userId) {
    if (data.userPrompts?.[userId]) return data.userPrompts[userId]
    return SYSTEM_PROMPTS[data.taskMode] || SYSTEM_PROMPTS.chat
  },

  setUserPrompt(userId, prompt) {
    if (!data.userPrompts) data.userPrompts = {}
    data.userPrompts[userId] = prompt
    save()
  },

  resetUserPrompt(userId) {
    if (data.userPrompts) delete data.userPrompts[userId]
    save()
  },

  getUserHistory(userId) {
    return data.chatHistory[userId] || []
  },

  addUserMessage(userId, role, content) {
    if (!data.chatHistory[userId]) {
      data.chatHistory[userId] = []
    }
    data.chatHistory[userId].push({ role, content })
    if (data.chatHistory[userId].length > 30) {
      data.chatHistory[userId] = data.chatHistory[userId].slice(-30)
    }
    save()
  },

  clearUserHistory(userId) {
    data.chatHistory[userId] = []
    save()
  },

  getUserLocation(userId) {
    return data.userLocations?.[userId] || null
  },

  setUserLocation(userId, loc) {
    if (!data.userLocations) data.userLocations = {}
    data.userLocations[userId] = loc
    save()
  },

}
