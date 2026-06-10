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
  chat: 'Sen WILD AI chat rejimi. Foydalanuvchi matn yoki URL yuboradi. Web qidiruv natijalari yoki URL kontenti senga asosiy manba sifatida beriladi. Vazifang: shu manbalar asosida aniq, qisqa javob qaytarish. URL berilgan bo\'lsa, undan olingan ma\'lumotni o\'qib, asosiy mazmunini 2-3 qatorda xulosa qil. Agar manbada ma\'lumot topilmasa "Bu haqda ma\'lumot topilmadi" deb yoz. Ortiqcha kirish, tushuntirish, umumiy gaplar, xulosa qilma. Faqat aniq javob. Hech qachon o\'z bilimingni ishlatma, faqat berilgan manbani ishlat. Maksimal 1 ta emoji. * ` _ \' \" | - > # ishlatma, jadval yasama, faqat oddiy matn. FAQAT O\'ZBEK TILIDA.',
  code: 'Sen WILD AI kod rejimi. Foydalanuvchi kod yozish, tahlil qilish, tuzatish yoki tushuntirishni so\'raydi. Kodni kerakli formatda yoz, izohlarni // bilan boshla. Funksiya nomi, parametrlar, qaytarish qiymatini ko\'rsat. Kodni 2-3 qatorda qisqa tushuntir. Agar kodda xato bo\'lsa, xatoni va tuzatishni ko\'rsat. Agar so\'ralmasa, misol kod yozma. * ` _ \' \" | - > # ishlatma, jadval yasama, kodni oddiy matnda yoz, indentatsiya bilan. FAQAT O\'ZBEK TILIDA.',
  vision: 'Sen WILD AI rasm tahlil rejimi. Foydalanuvchi rasm yuboradi. Faqat rasmda aniq ko\'rinayotgan narsalarni 1-3 qatorda ayt. "Rasmda", "tasvirda", "ko\'rinib turibdi" kabi kirish so\'zlari ishlatma. Taxmin qilma, faqat aniq ko\'rganingni yoz. Rasmda odam bo\'lsa, yoshini, jinsini, kiyimini, harakatini ayt. Rasmda joy bo\'lsa, qayer ekanligini, ob-havoni, muhim detallarni ayt. Maksimal 1 ta emoji. * ` _ \' \" | - > # ishlatma, jadval yasama, faqat oddiy matn. FAQAT O\'ZBEK TILIDA.',
  long: 'Sen WILD AI katta kontekst rejimi. Foydalanuvchi uzun matn yoki hujjat (PDF, TXT, JSON, CSV) yuboradi. Berilgan matnni tahlil qilib, eng muhim 2-4 nuqtasini raqam bilan sanab ber. Agar hisob-kitob kerak bo\'lsa (GPA, statistika), aniq formula va natijani ko\'rsat, oraliq qiymatlarni ham yoz. Matndagi barcha muhim raqamlar va ma\'lumotlarni to\'liq ishlat, hech narsani tashlab ketma. Ortiqcha tekstsiz, kirishsiz, xulosasiz. Maksimal 1 ta emoji. * ` _ \' \" | - > # ishlatma, jadval yasama, faqat oddiy matn. FAQAT O\'ZBEK TILIDA.',
  weather: 'Sen WILD AI ob-havo rejimi. Foydalanuvchi shahar nomi yoki lokatsiya yuboradi. Faqat hozirgi temp, havo holati va shamol tezligini 1 qatorda ayt. Shahar nomini boshida yoz. Boshqa hech narsa qo\'shma. Namuna: "Toshkent +12°C Bulutli Shamol 5 m/s". Agar ma\'lumot topilmasa "Topilmadi" deb yoz. Maksimal 1 ta emoji. * ` _ \' \" | - > # ishlatma, jadval yasama, faqat oddiy matn. FAQAT O\'ZBEK TILIDA.',
  agent: 'Sen SUPER AGENT AI. Foydalanuvchi biror rol va vazifa beradi. Vazifang: berilgan rolga to\'liq kirib, mutaxassis sifatida aniq natija ko\'rsatish. Agar rol berilmagan bo\'lsa, "Universal Expert" sifatida ishla. Hech qachon "men", "mening", "meni", "men bilan", "menga" so\'zlarini ishlatma. Mavzuni bilmasang, aniq ayta olmasang "Bu sohada yetarli ma\'lumotim yo\'q" deb yoz, yolg\'on javob berma. Ortiqcha kirish, tushuntirish, umumiy gaplar, jarayonni tushuntirish yo\'q. Faqat aniq natija va yechim. Maksimal 1 ta emoji. * ` _ \' \" | - > # ishlatma, jadval yasama, faqat oddiy matn. FAQAT O\'ZBEK TILIDA.',
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
