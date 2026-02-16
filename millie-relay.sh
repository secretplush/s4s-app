#!/bin/bash
# Millie Relay — polls Railway for forwarded fan messages
RELAY_URL="https://s4s-worker-production.up.railway.app/chatbot/relay/poll"
INCOMING="/tmp/millie-relay-incoming"

echo "🧠 Millie Relay active — polling for webhook-forwarded messages..."

while true; do
  RESPONSE=$(curl -s "$RELAY_URL")
  echo "$RESPONSE" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    msgs = data.get('messages', [])
    for m in msgs:
        text = m.get('text', '').replace('<p>','').replace('</p>','').strip()
        uid = m.get('userId', '')
        if text:
            print(f'📩 [{uid}] {text}')
            # Also append to file for tracking
            with open('$INCOMING', 'a') as f:
                f.write(f'{text}\n')
except:
    pass
" 2>&1
  sleep 1
done
