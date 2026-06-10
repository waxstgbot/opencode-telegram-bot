# Opencode Telegram Bot

Kompyuteringizdagi **opencode sessionlari** va **shell** komandalarini Telegram orqali boshqaring.

## Arxitektura

```
Telegram <--> Koyeb/Render (Bot) <--> Cloudflared Tunnel <--> Sizning kompyuter (opencode serve)
```

- **Bot** — Koyeb free tierda 24/7 ishlaydi (hech qachon uxlamaydi)
- **Tunnel** — Cloudflared orqali kompyuteringiz Internetga ochiladi
- **Kompyuter** — Faqat ishlatganda yogasiz, ishlatmasangiz bot "offline" deydi

---

## 1. Bot ni deploy qilish

### Variant A: Koyeb (tavsiya etiladi — butunlay free, uxlamaydi)

1. **Koyeb** ga ro'yxatdan o'ting: https://app.koyeb.com
2. Yangi **Web Service** yarating:
   - **GitHub** orqali yoki **manual**
   - Agar GitHub repo bo'lmasa:
     ```bash
     # Reponi yuklab oling
     cd opencode-telegram-bot
     
     # GitHub repo yarating va push qiling
     git init && git add . && git commit -m "initial"
     # GitHub da repo yarating, keyin:
     git remote add origin https://github.com/USER/REPO.git
     git push -u origin main
     ```
3. Koyeb da:
   - **Build command:** `npm install`
   - **Run command:** `node src/index.js`
   - **Environment variables** (hammasini qo'shing):

| Variable | Qiymat |
|----------|--------|
| `BOT_TOKEN` | `8945964145:AAFEMMQ4oku-Xs8a7opdgEd8rTc0reT5H_I` |
| `ALLOWED_USERS` | *(keyin qo'gasiz)* |
| `REGISTER_SECRET` | `shohjahon-secret-2024` |
| `PORT` | `3000` |

### Variant B: Render (free, lekin uxlab qoladi)

1. **Render** ga ro'yxatdan o'ting: https://render.com
2. **New +** → **Web Service** → GitHub repongizni ulang
3. Sozlamalar:
   - **Build Command:** `npm install`
   - **Start Command:** `node src/index.js`
   - **Free Tier** ni tanlang
4. Environment variables (yuqoridagi jadval bo'yicha)
5. **UptimeRobot** da (https://uptimerobot.com) har 5 daqiqada ping qo'ying:
   - Monitor Type: **HTTP(s)**
   - URL: `https://SIZNING-APP-INGIZ.onrender.com`
   - Interval: **5 minutes**

---

## 2. Telegram ID ingizni olish

1. Botga `https://t.me/opencode_session_bot` orqali xabar yozing
   *(bot hali ishga tushmagan bo'lsa, avval uni ishga tushiring)*
2. Bot sizga Telegram ID ingizni qaytaradi
3. Shu ID ni `ALLOWED_USERS` ga yozing va **Koyeb/Render** da restart qiling

---

## 3. Kompyuterda tunnel sozlash

### a) Cloudflared o'rnatish

```bash
# Linux (amd64)
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /tmp/cloudflared
sudo install /tmp/cloudflared /usr/local/bin/cloudflared

# Yoki:
# macOS: brew install cloudflared
# Windows: winget install cloudflare.cloudflared
```

### b) start.sh ni moslash

```bash
cd opencode-telegram-bot/computer
nano start.sh
```

O'zgartirishingiz kerak:
- `BOT_URL` — Koyeb/Render dagi app URL ingizga (`https://appname.region.koyeb.app`)
- `REGISTER_SECRET` — .env dagi bilan bir xil
- `OPENCODE_PASSWORD` — opencode server paroli (agar ishlatsangiz)

### c) Ishga tushirish

```bash
bash computer/start.sh
```

**Natija:**
- `opencode serve` port 4096 da ishga tushadi
- `cloudflared tunnel` ochiladi
- Tunnel URL avtomatik bot ga registratsiya qilinadi
- Har 60 sekundda ping yuborib, kompyuter onlayn ekanligini bildiradi

### d) Avtomatik ishga tushish (systemd)

```bash
sudo cp computer/opencode-tunnel.service /etc/systemd/system/
sudo nano /etc/systemd/system/opencode-tunnel.service
# User, ExecStart, Environment larni o'zgartiring

sudo systemctl enable opencode-tunnel
sudo systemctl start opencode-tunnel
```

---

## 4. Bot komandalari

| Komanda | Ta'rif |
|---------|--------|
| `/start` | Boshlang'ich xabar |
| `/help` | Yordam |
| `/status` | Kompyuter va bot holati |
| `/sessions` | Barcha sessionlar ro'yxati |
| `/session <id>` | Session tafsilotlari |
| `/new <xabar>` | Yangi session + prompt |
| `/prompt <id> <xabar>` | Sessionga yozish |
| `/shell <komanda>` | Terminal komandasi |
| `/del <id>` | Sessionni o'chirish |

---

## 5. Ishlash tartibi

1. **Kompyuter o'chiq** → Bot "Offline" deydi
2. **Kompyuterni yogasiz** → Avtomatik `start.sh` ni ishga tushiring (yoki systemd avtomat)
3. **Tunnel ochiladi** → Bot ga registratsiya
4. **Telegram dan buyruq berasiz** → Bot tunnel orqali opencode ga murojaat qiladi
5. **Ish tugagach** → Kompyuterni o'chirsangiz, bot "Offline" ga qaytadi

**Xarajat: $0** (Koyeb free + cloudflared free + Telegram free)

---

## Fayllar tuzilishi

```
opencode-telegram-bot/
├── src/
│   ├── index.js        # Express server + bot setup
│   ├── bot.js          # Telegram bot komandalari
│   ├── client.js       # Opencode API client
│   └── store.js        # Persistent store (JSON)
├── computer/
│   ├── start.sh        # Kompyuterda ishga tushirish skripti
│   └── opencode-tunnel.service  # systemd service
├── .env                # Konfiguratsiya
├── Procfile            # Render uchun
└── package.json
```
