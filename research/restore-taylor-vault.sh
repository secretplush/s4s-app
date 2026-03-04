#!/bin/bash
# Restore taylorskully vault mappings using curl (python requests hangs on LibreSSL)

OF_API="https://app.onlyfansapi.com/api"
OF_KEY="ofapi_bT4J1Er2YBow46EihDfjlSFf5HRmiM15M4DCOoHn7889d8b4"
REDIS="https://major-spider-50836.upstash.io"
REDIS_KEY="AcaUAAIncDI3NjBkZmQ2YzI1MWY0MmQ2YjU0MzJkMDM5ODNiNjI2Y3AyNTA4MzY"
TAYLOR="acct_2f5014266cb04e8a9693b5d067d5c9bb"
DONOR="acct_54e3119e77da4429b6537f7dd2883a05"  # biancaawoods

TMPDIR=$(mktemp -d)
RESULTS_FILE="$TMPDIR/results.json"
echo "{}" > "$RESULTS_FILE"

# Get biancaawoods' targets from Redis
echo "📦 Loading vault mappings..."
TARGETS=$(curl -s --max-time 15 -X POST "$REDIS" \
  -H "Authorization: Bearer $REDIS_KEY" \
  -H "Content-Type: application/json" \
  -d '["GET","vault_mappings"]' | python3 -c "
import sys,json
d=json.loads(json.load(sys.stdin)['result'])
bw=d.get('biancaawoods',{})
for t,v in bw.items():
    print(f'{t}:{v}')
")

TOTAL=$(echo "$TARGETS" | wc -l | tr -d ' ')
echo "🎯 $TOTAL targets to process"

SUCCESS=0
FAILED=0
TAYLOR_V1="{}"
COUNT=0

for line in $TARGETS; do
  TARGET=$(echo "$line" | cut -d: -f1)
  VAULT_ID=$(echo "$line" | cut -d: -f2)
  COUNT=$((COUNT + 1))
  echo ""
  echo "[$COUNT/$TOTAL] $TARGET (vault_id: $VAULT_ID)"

  # Step 1: Create temp post on donor to get CDN URL
  POST_RESP=$(curl -s --max-time 20 -X POST "$OF_API/$DONOR/posts" \
    -H "Authorization: Bearer $OF_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"text\":\"temp\",\"mediaFiles\":[\"$VAULT_ID\"]}")

  POST_ID=$(echo "$POST_RESP" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('data',d).get('id',''))" 2>/dev/null)
  CDN_URL=$(echo "$POST_RESP" | python3 -c "import sys,json;d=json.load(sys.stdin);m=d.get('data',d).get('media',[]);print(m[0]['files']['full']['url'] if m else '')" 2>/dev/null)

  if [ -z "$CDN_URL" ]; then
    echo "  ❌ No CDN URL"
    FAILED=$((FAILED + 1))
    [ -n "$POST_ID" ] && curl -s --max-time 10 -X DELETE "$OF_API/$DONOR/posts/$POST_ID" -H "Authorization: Bearer $OF_KEY" > /dev/null 2>&1
    continue
  fi

  # Step 2: Download image
  curl -s --max-time 30 -o "$TMPDIR/img.jpg" "$CDN_URL"
  IMG_SIZE=$(wc -c < "$TMPDIR/img.jpg" | tr -d ' ')
  echo "  ✅ Downloaded ${IMG_SIZE}b"

  # Delete temp donor post
  curl -s --max-time 10 -X DELETE "$OF_API/$DONOR/posts/$POST_ID" -H "Authorization: Bearer $OF_KEY" > /dev/null 2>&1

  # Step 3: Upload to Taylor's vault
  sleep 2
  UPLOAD_RESP=$(curl -s --max-time 30 -X POST "$OF_API/$TAYLOR/media/upload" \
    -H "Authorization: Bearer $OF_KEY" \
    -F "file=@$TMPDIR/img.jpg;type=image/jpeg;filename=${TARGET}_promo.jpg")

  MEDIA_ID=$(echo "$UPLOAD_RESP" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('prefixed_id') or d.get('id') or '')" 2>/dev/null)

  if [ -z "$MEDIA_ID" ]; then
    echo "  ❌ Upload failed: $UPLOAD_RESP"
    FAILED=$((FAILED + 1))
    continue
  fi
  echo "  📤 Media ID: $MEDIA_ID"

  # Step 4: Create post on Taylor to mint vault_id
  sleep 3
  TAYLOR_RESP=$(curl -s --max-time 20 -X POST "$OF_API/$TAYLOR/posts" \
    -H "Authorization: Bearer $OF_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"text\":\"@$TARGET\",\"mediaFiles\":[\"$MEDIA_ID\"]}")

  TAYLOR_POST_ID=$(echo "$TAYLOR_RESP" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('data',d).get('id',''))" 2>/dev/null)
  TAYLOR_VAULT_ID=$(echo "$TAYLOR_RESP" | python3 -c "import sys,json;d=json.load(sys.stdin);m=d.get('data',d).get('media',[]);print(m[0].get('id','') if m else '')" 2>/dev/null)

  if [ -z "$TAYLOR_VAULT_ID" ]; then
    echo "  ❌ No vault_id from Taylor post"
    FAILED=$((FAILED + 1))
    [ -n "$TAYLOR_POST_ID" ] && curl -s --max-time 10 -X DELETE "$OF_API/$TAYLOR/posts/$TAYLOR_POST_ID" -H "Authorization: Bearer $OF_KEY" > /dev/null 2>&1
    continue
  fi

  # Delete Taylor's temp post
  sleep 2
  curl -s --max-time 10 -X DELETE "$OF_API/$TAYLOR/posts/$TAYLOR_POST_ID" -H "Authorization: Bearer $OF_KEY" > /dev/null 2>&1

  echo "  ✅ Taylor vault_id: $TAYLOR_VAULT_ID"
  SUCCESS=$((SUCCESS + 1))

  # Append to results
  echo "$TARGET:$TAYLOR_VAULT_ID" >> "$TMPDIR/completed.txt"

  # Save to Redis every 5 successes
  if [ $((SUCCESS % 5)) -eq 0 ]; then
    echo "  💾 Saving progress to Redis ($SUCCESS done)..."
    # Build JSON and save
    python3 -c "
import json, requests
completed = {}
with open('$TMPDIR/completed.txt') as f:
    for line in f:
        t, v = line.strip().split(':')
        completed[t] = v

# Load current mappings via curl-style
import subprocess
r = subprocess.run(['curl', '-s', '--max-time', '15', '-X', 'POST', '$REDIS',
    '-H', 'Authorization: Bearer $REDIS_KEY', '-H', 'Content-Type: application/json',
    '-d', '[\"GET\",\"vault_mappings\"]'], capture_output=True, text=True)
data = json.loads(json.loads(r.stdout)['result'])
data['taylorskully'] = completed

# Save v1
payload = json.dumps(['SET', 'vault_mappings', json.dumps(data)])
subprocess.run(['curl', '-s', '--max-time', '15', '-X', 'POST', '$REDIS',
    '-H', 'Authorization: Bearer $REDIS_KEY', '-H', 'Content-Type: application/json',
    '-d', payload], capture_output=True)

# Save v2
r2 = subprocess.run(['curl', '-s', '--max-time', '15', '-X', 'POST', '$REDIS',
    '-H', 'Authorization: Bearer $REDIS_KEY', '-H', 'Content-Type: application/json',
    '-d', '[\"GET\",\"vault_mappings_v2\"]'], capture_output=True, text=True)
v2 = json.loads(json.loads(r2.stdout)['result']) if json.loads(r2.stdout).get('result') else {}
v2['taylorskully'] = {t: {'ghost': [v], 'pinned': [v], 'massDm': [v]} for t,v in completed.items()}
payload2 = json.dumps(['SET', 'vault_mappings_v2', json.dumps(v2)])
subprocess.run(['curl', '-s', '--max-time', '15', '-X', 'POST', '$REDIS',
    '-H', 'Authorization: Bearer $REDIS_KEY', '-H', 'Content-Type: application/json',
    '-d', payload2], capture_output=True)
print(f'Saved {len(completed)} mappings')
"
  fi

  sleep 3
done

# Final save
echo ""
echo "🏁 Final save..."
if [ -f "$TMPDIR/completed.txt" ]; then
  python3 -c "
import json, subprocess
completed = {}
with open('$TMPDIR/completed.txt') as f:
    for line in f:
        t, v = line.strip().split(':')
        completed[t] = v

r = subprocess.run(['curl', '-s', '--max-time', '15', '-X', 'POST', '$REDIS',
    '-H', 'Authorization: Bearer $REDIS_KEY', '-H', 'Content-Type: application/json',
    '-d', '[\"GET\",\"vault_mappings\"]'], capture_output=True, text=True)
data = json.loads(json.loads(r.stdout)['result'])
data['taylorskully'] = completed
payload = json.dumps(['SET', 'vault_mappings', json.dumps(data)])
subprocess.run(['curl', '-s', '--max-time', '15', '-X', 'POST', '$REDIS',
    '-H', 'Authorization: Bearer $REDIS_KEY', '-H', 'Content-Type: application/json',
    '-d', payload], capture_output=True)

r2 = subprocess.run(['curl', '-s', '--max-time', '15', '-X', 'POST', '$REDIS',
    '-H', 'Authorization: Bearer $REDIS_KEY', '-H', 'Content-Type: application/json',
    '-d', '[\"GET\",\"vault_mappings_v2\"]'], capture_output=True, text=True)
v2 = json.loads(json.loads(r2.stdout)['result']) if json.loads(r2.stdout).get('result') else {}
v2['taylorskully'] = {t: {'ghost': [v], 'pinned': [v], 'massDm': [v]} for t,v in completed.items()}
payload2 = json.dumps(['SET', 'vault_mappings_v2', json.dumps(v2)])
subprocess.run(['curl', '-s', '--max-time', '15', '-X', 'POST', '$REDIS',
    '-H', 'Authorization: Bearer $REDIS_KEY', '-H', 'Content-Type: application/json',
    '-d', payload2], capture_output=True)
print(f'✅ Final save: {len(completed)} mappings')
"
fi

echo ""
echo "=========================================="
echo "✅ Success: $SUCCESS"
echo "❌ Failed: $FAILED"
echo "Total: $TOTAL"

rm -rf "$TMPDIR"
