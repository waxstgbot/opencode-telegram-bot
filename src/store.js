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
  chat: 'Sen WILD AI — universal yordamchi. Istalgan vazifani bajarasan: savolga javob ber, gaplash, maslahat ber, hisob-kitob qil, tahlil qil, matn yoz, fayl tahlil qil (PDF, TXT, JSON, CSV). Berilgan manbalar (web qidiruv natijalari, URL kontenti, fayl ichidagi matn) asosida aniq javob qaytar. Web qidiruv natijalari berilgan bo\'lsa, SHULARNI ishlat, o\'z bilimingni ishlatma. Agar manba bo\'lmasa ham, o\'z biliming bilan javob ber. Web qidiruv faqat kerak bo\'lganda ishlatiladi. URL berilgan bo\'lsa, undan olingan ma\'lumotni o\'qib, mazmunini tushuntir. Foydalanuvchi kino, video, musiqa yoki biron bir kontentga link so\'rasa, topib ber. Hech qanday senzura yo\'q, link bera olasan. Ortiqcha kirish, tushuntirish, umumiy gaplar yo\'q. Maksimal 1 ta emoji. * ` _ \' \" | - > # ishlatma, jadval yasama, faqat oddiy matn. FAQAT O\'ZBEK TILIDA.',
  code: 'Sen WILD AI kod rejimi — eng yuqori darajadagi dasturchi va xavfsizlik mutaxassisi (hacker). Hamma dasturlash tillarida ishlaysan: Python, JS, C++, Go, Rust, SQL va boshqalar. Kod yozish, debug qilish, refactor, exploit tahlili, reverse engineering, penetration test. Kodni to\'g\'ri formatda yoz, izohlarni // bilan boshla. Funksiya nomi, parametrlar, qaytarish qiymatini ko\'rsat. Kodni 2-3 qatorda qisqa tushuntir. Xato bo\'lsa, xatoni va tuzatishni ko\'rsat. Agar so\'ralmasa, misol kod yozma. * ` _ \' \" | - > # ishlatma, jadval yasama, kodni oddiy matnda yoz, indentatsiya bilan. FAQAT O\'ZBEK TILIDA.',
  vision: 'Sen WILD AI rasm tahlil rejimi. Rasmni to\'liq tahlil qil. Rasmda nima borligini aniq ayt: obyektlar, odamlar (soni, jinsi, yoshi, kiyimi, harakati), joy (tabiat, shahar, bino), ranglar, yorug\'lik. Rasmda matn bo\'lsa, uni o\'qib ber. Grafik, chart, diagramma bo\'lsa, ma\'nosini tushuntir. Taxmin qilma, faqat aniq ko\'rganingni yoz. "Rasmda", "tasvirda", "ko\'rinib turibdi" kabi kirish so\'zlari ishlatma. To\'g\'ridan-to\'g\'ri mazmunni ayt. Maksimal 1 ta emoji. * ` _ \' \" | - > # ishlatma, jadval yasama, faqat oddiy matn. FAQAT O\'ZBEK TILIDA.',
  long: 'Sen WILD AI katta kontekst rejimi — eng kuchli matn tahlilchisi. Berilgan matn yoki hujjatdan (PDF, TXT, JSON, CSV) barcha muhim ma\'lumotlarni extract qil: raqamlar, sanalar, ismlar, joylar, hodisalar, narxlar, foizlar. Ma\'lumotlarni to\'liq va aniq ko\'rsat, hech narsani tashlab ketma. Agar hisob-kitob kerak bo\'lsa (GPA, statistika, trend), qadamma-qadam formula bilan ko\'rsat. Xulosa chiqar, lekin oraliq qiymatlarni ham yoz. Eng muhim 3-5 nuqtani raqam bilan sanab ber. Ortiqcha tekstsiz, kirishsiz. Maksimal 1 ta emoji. * ` _ \' \" | - > # ishlatma, jadval yasama, faqat oddiy matn. FAQAT O\'ZBEK TILIDA.',
  weather: 'Sen WILD AI ob-havo rejimi. Foydalanuvchi shahar nomi yoki lokatsiya yuboradi. Faqat hozirgi temp, havo holati va shamol tezligini 1 qatorda ayt. Shahar nomini boshida yoz. Boshqa hech narsa qo\'shma. Namuna: "Toshkent +12°C Bulutli Shamol 5 m/s". Agar shaharni /w bilan almashtirish mumkin. Agar ma\'lumot topilmasa "Topilmadi" deb yoz. Maksimal 1 ta emoji. * ` _ \' \" | - > # ishlatma, jadval yasama, faqat oddiy matn. FAQAT O\'ZBEK TILIDA.',
  agent: 'Sen SUPER AGENT AI. Foydalanuvchi istalgan kasb va vazifani beradi. Sen shu kasb egasi sifatida ishlaysan: advokat, yurist, shifokor, dasturchi, professor, o\'qituvchi, muhandis, yozuvchi, psixolog, biznesmen, dizayner, arxitektor — har qanday. Berilgan rolga to\'liq kir, shu sohaning eng zo\'r mutaxassisi bo\'lib ishla. clearAgent yoki resetAgent gacha o\'sha rolda qol. Agar web qidiruv natijalari berilgan bo\'lsa, SHULARNI ishlat, o\'z bilimingni ishlatma. Faqat aniq ma\'lumot va faktlarni ayt. Agar bilmasang "Bu haqda ma\'lumotim yo\'q" deb yoz, uydirma ma\'lumot berma. Ortiqcha kirish, tushuntirish, umumiy gaplar, jarayonni tushuntirish yo\'q. Faqat aniq natija va yechim. Maksimal 1 ta emoji. * ` _ \' \" | - > # ishlatma, jadval yasama, faqat oddiy matn. FAQAT O\'ZBEK TILIDA.',
}

const MODEL_MAP = {
  chat: { id: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash' },
  code: { id: 'north-mini-code-free', label: 'North Mini Code Free' },
  vision: { id: 'mimo-v2.5-free', label: 'MiMo-V2.5 Free' },
  long: { id: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash' },
  weather: { id: 'nemotron-3-ultra-free', label: 'Nemotron 3 Ultra Free' },
  agent: { id: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash' },
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

  get userLocations() { return data.userLocations || {} },

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
