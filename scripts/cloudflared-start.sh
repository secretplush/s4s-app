#!/bin/bash
# Auto-start cloudflared tunnel and register URL in Railway Redis
LOGFILE="/tmp/cloudflared.log"
RAILWAY_BASE="https://s4s-worker-production.up.railway.app"

# Kill existing
pkill -f "cloudflared tunnel" 2>/dev/null
sleep 1

# Start tunnel
cloudflared tunnel --url http://localhost:18789 > "$LOGFILE" 2>&1 &
sleep 6

# Extract URL
TUNNEL_URL=$(grep "trycloudflare.com" "$LOGFILE" | grep -o "https://[^ |]*")

if [ -n "$TUNNEL_URL" ]; then
  echo "Tunnel URL: $TUNNEL_URL"
  # Register with Railway
  curl -s -X POST "$RAILWAY_BASE/openclaw/tunnel" \
    -H "Content-Type: application/json" \
    -d "{\"url\": \"$TUNNEL_URL\", \"token\": \"05382603da53367102df5f03f48752ad2b33cbc9e2830db1\"}"
  echo ""
  echo "Registered with Railway"
else
  echo "ERROR: No tunnel URL found"
  cat "$LOGFILE"
fi
