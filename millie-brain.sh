#!/bin/bash
API_KEY="ofapi_bT4J1Er2YBow46EihDfjlSFf5HRmiM15M4DCOoHn7889d8b4"
API_BASE="https://app.onlyfansapi.com/api"
ACCOUNT_ID="acct_ebca85077e0a4b7da04cf14176466411"
TEST_USER="526616700"
LAST_FILE="/tmp/millie-last-seen"

while true; do
  curl -s "${API_BASE}/${ACCOUNT_ID}/chats/${TEST_USER}/messages?limit=5" \
    -H "Authorization: Bearer ${API_KEY}" | python3 -c "
import sys, json, os
data = json.load(sys.stdin)
msgs = data.get('data', data.get('list', []))
last_file = '$LAST_FILE'
last_seen = open(last_file).read().strip() if os.path.exists(last_file) else '0'
fan_msgs = [m for m in msgs if not m.get('isSentByMe', False)]
new_msgs = []
for m in fan_msgs:
    mid = str(m.get('id', ''))
    if mid > last_seen:
        text = m.get('text', '').replace('<p>','').replace('</p>','').strip()
        if text:
            new_msgs.append((mid, text))
if new_msgs:
    for mid, text in reversed(new_msgs):
        print(f'📩 {text}')
    newest = max(m[0] for m in new_msgs)
    with open(last_file, 'w') as f:
        f.write(newest)
" 2>&1
  sleep 1
done
