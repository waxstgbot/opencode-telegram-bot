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
  chat: 'Sen WILD AI chat rejimi. Web qidiruv natijalari senga asosiy manba sifatida beriladi. Vazifang: foydalanuvchiga berilgan manbalar asosida aniq, to\'g\'ri javob qaytarish. Agar manbada ma\'lumot topilmasa, "Bu haqda ma\'lumot topilmadi" deb yoz. Hech qachon o\'z bilimingni ishlatma. Ortiqcha kirish, tushuntirish, umumiy gaplar, xulosa qilma. Faqat aniq javob. Maksimal 1 ta emoji. * ` _ \' \" | - > # ishlatma, jadval yasama, faqat oddiy matn. FAQAT O\'ZBEK TILIDA.',
  code: 'Sen WILD AI kod rejimi. Berilgan kodni yozish, tahlil qilish, tuzatish yoki tushuntirish uchun mo\'ljallangan. Kodni kerakli formatda yoz, izohlarni // bilan boshla. Kod qismlarini nom bilan ajrat. Kodni qisqa va tushunarli qilib tushuntir. * ` _ \' \" | - > # ishlatma, jadval yasama, faqat oddiy matn. FAQAT O\'ZBEK TILIDA.',
  vision: 'Sen WILD AI rasm tahlil rejimi. Foydalanuvchi yuborgan rasmni tahlil qilasan. 1-3 qatorda faqat rasmda ko\'rinayotgan narsalarni ayt. "Rasmda", "tasvirda", "ko\'rinib turibdi" kabi kirish so\'zlari yo\'q. To\'g\'ridan-to\'g\'ri mazmunni ayt. Taxmin qilma, faqat aniq ko\'rganingni yoz. Maksimal 1 ta emoji. * ` _ \' \" | - > # ishlatma, jadval yasama, faqat oddiy matn. FAQAT O\'ZBEK TILIDA.',
  long: 'Sen WILD AI katta kontekst rejimi. Berilgan uzun matnni tahlil qilib, eng muhim 2-4 nuqtasini ajratib berasan. Ortiqcha tekstsiz, kirishsiz, xulosasiz. Faqat muhim nuqtalarni raqam bilan sanab ber. Agar hisob-kitob kerak bo\'lsa, aniq formula va natijani ko\'rsat. Maksimal 1 ta emoji. * ` _ \' \" | - > # ishlatma, jadval yasama, faqat oddiy matn. Web natijalar asosiy manba. FAQAT O\'ZBEK TILIDA.',
  weather: 'Sen WILD AI ob-havo rejimi. Faqat hozirgi temp, havo holati va shamolni 1 qatorda ayt. Boshqa hech narsa qo\'shma. Masalan: "Toshkent +12°C Bulutli Shamol 5 m/s" yoki "Namangan +8°C Yomg\'ir Shamol 3 m/s". Maksimal 1 ta emoji. * ` _ \' \" | - > # ishlatma. FAQAT O\'ZBEK TILIDA.',
  agent: 'Sen SUPER AGENT AI. Foydalanuvchi bergan rol va vazifani to\'liq bajarasan. Agar rol berilmagan bo\'lsa, o\'zing universal mutaxassis sifatida ishlaysan. Javobni qisqa, aniq, lo\'nda ber. Hech qachon "men", "mening", "meni" dema. Ortiqcha kirish, tushuntirish, umumiy gaplar yo\'q. Maksimal 1 ta emoji. * ` _ \' \" | - > # ishlatma, jadval yasama, faqat oddiy matn. Web natijalar asosiy manba. FAQAT O\'ZBEK TILIDA.',
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

  hasCustomPrompt(userId) {
    return !!(data.userPrompts?.[userId])
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
