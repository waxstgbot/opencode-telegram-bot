#!/usr/bin/env bash
set -e

# Konfiguratsiya — .env faylidan yoki o'zgartiring
BOT_URL="${BOT_URL:-http://localhost:3000}"
REGISTER_SECRET="${REGISTER_SECRET:-change-this-random-string}"
OPENCODE_PORT="${OPENCODE_PORT:-4096}"
OPENCODE_PASSWORD="${OPENCODE_PASSWORD:-}"

# 1. Opencode serve ni ishga tushirish
echo "🚀 Starting opencode serve on port $OPENCODE_PORT..."
OPENCODE_SERVER_PASSWORD="$OPENCODE_PASSWORD" \
  nohup opencode serve --port "$OPENCODE_PORT" \
  > /tmp/opencode-serve.log 2>&1 &
OPENCODE_PID=$!
echo "   PID: $OPENCODE_PID"

# Kutib turish
sleep 3

# 2. Cloudflared tunnel
echo "🔗 Starting cloudflared tunnel..."
nohup cloudflared tunnel --url "http://localhost:$OPENCODE_PORT" \
  > /tmp/cloudflared.log 2>&1 &
CLOUDFLARED_PID=$!
echo "   PID: $CLOUDFLARED_PID"

# 3. Tunnel URL ni cloudflared log dan ajratib olish
echo "⏳ Waiting for tunnel URL..."
TUNNEL_URL=""
for i in $(seq 1 30); do
  TUNNEL_URL=$(grep -oP 'https?://[a-zA-Z0-9.-]+\.trycloudflare\.com' /tmp/cloudflared.log | head -1)
  if [ -n "$TUNNEL_URL" ]; then
    break
  fi
  sleep 1
done

if [ -z "$TUNNEL_URL" ]; then
  echo "❌ Tunnel URL topilmadi. Cloudflared log:"
  cat /tmp/cloudflared.log
  exit 1
fi

echo "✅ Tunnel: $TUNNEL_URL"

# 4. Bot ga registratsiya
echo "📡 Registering with bot..."
curl -s -X POST "$BOT_URL/register" \
  -H "Content-Type: application/json" \
  -d "{\"secret\":\"$REGISTER_SECRET\",\"url\":\"$TUNNEL_URL\"}"

echo ""
echo "✅ Registered!"
echo "   Bot URL : $BOT_URL"
echo "   Tunnel  : $TUNNEL_URL"
echo ""
echo "   To stop:"
echo "   kill $OPENCODE_PID $CLOUDFLARED_PID"
echo ""
echo "   Logs:"
echo "   tail -f /tmp/opencode-serve.log"
echo "   tail -f /tmp/cloudflared.log"

# Ctrl+C da tozalash
trap "echo 'Stopping...'; kill $OPENCODE_PID $CLOUDFLARED_PID 2>/dev/null; exit 0" INT TERM

# Background da ping yuborish (har 60 sekund)
while true; do
  sleep 60
  curl -s -X POST "$BOT_URL/ping" \
    -H "Content-Type: application/json" \
    -d "{\"secret\":\"$REGISTER_SECRET\"}" \
    > /dev/null 2>&1 || true
done
