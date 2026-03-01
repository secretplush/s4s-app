#!/bin/bash
# Reliable POST to Railway with retry + TLS hardening
# Usage: railway-post.sh <endpoint> <json-body>
# Example: railway-post.sh /dispatch/complete '{"fanIds":["123"],"accountId":"acct_xxx"}'

RAILWAY="https://s4s-worker-production.up.railway.app"
ENDPOINT="$1"
BODY="$2"
MAX_RETRIES=3
RETRY_DELAY=5

for i in $(seq 1 $MAX_RETRIES); do
  RESPONSE=$(curl -s --max-time 15 --http1.1 --tlsv1.2 \
    -X POST "${RAILWAY}${ENDPOINT}" \
    -H 'Content-Type: application/json' \
    -d "$BODY" 2>/tmp/railway-curl-stderr)
  EXIT_CODE=$?
  
  if [ $EXIT_CODE -eq 0 ]; then
    echo "$RESPONSE"
    exit 0
  fi
  
  echo "RETRY $i/$MAX_RETRIES: curl exit $EXIT_CODE" >&2
  cat /tmp/railway-curl-stderr >&2
  
  if [ $i -lt $MAX_RETRIES ]; then
    sleep $RETRY_DELAY
    RETRY_DELAY=$((RETRY_DELAY * 2))
  fi
done

# All retries failed — call abort to release locks
echo "FAILED: All $MAX_RETRIES retries exhausted. Calling abort." >&2
curl -s --max-time 15 --http1.1 --tlsv1.2 \
  -X POST "${RAILWAY}/dispatch/abort" \
  -H 'Content-Type: application/json' \
  -d "$BODY" 2>/dev/null

echo '{"ok":false,"error":"curl_retry_exhausted"}'
exit 1
