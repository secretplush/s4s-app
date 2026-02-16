#!/bin/bash
API_KEY="ofapi_bT4J1Er2YBow46EihDfjlSFf5HRmiM15M4DCOoHn7889d8b4"
ACCT="acct_ebca85077e0a4b7da04cf14176466411"
FAN_ID="526616700"
BASE="https://app.onlyfansapi.com/api"
LAST_MSG_ID=""

while true; do
  RESP=$(curl -s "$BASE/$ACCT/chats/$FAN_ID/messages?limit=3" \
    -H "Authorization: Bearer $API_KEY" 2>/dev/null)
  
  # Get latest message
  LATEST_ID=$(echo "$RESP" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['data'][0]['id'])" 2>/dev/null)
  IS_FAN=$(echo "$RESP" | python3 -c "import json,sys; d=json.load(sys.stdin); print('FAN' if not d['data'][0]['isSentByMe'] else 'ME')" 2>/dev/null)
  TEXT=$(echo "$RESP" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['data'][0].get('text','')[:200])" 2>/dev/null)
  
  if [ "$LATEST_ID" != "$LAST_MSG_ID" ] && [ "$IS_FAN" = "FAN" ]; then
    echo "📩 NEW FAN MSG [$LATEST_ID]: $TEXT"
    LAST_MSG_ID="$LATEST_ID"
  elif [ "$LATEST_ID" != "$LAST_MSG_ID" ]; then
    LAST_MSG_ID="$LATEST_ID"
  fi
  
  sleep 2
done
