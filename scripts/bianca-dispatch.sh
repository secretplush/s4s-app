#!/bin/bash
# Bianca Code-Only Dispatcher
# Called by OpenClaw cron (systemEvent). No LLM logic — just curl + spawn.
# Railway's /dispatch/tick handles all dispatch decisions.

RAILWAY="https://s4s-worker-production.up.railway.app"
RESULT=$(curl -s --max-time 10 --http1.1 --tlsv1.2 -X POST "$RAILWAY/dispatch/tick")

ACTION=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('action','error'))" 2>/dev/null)

if [ "$ACTION" = "crisis" ]; then
  FANID=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('fanId',''))" 2>/dev/null)
  MSG=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('message',''))" 2>/dev/null)
  echo "DISPATCH_CRISIS: $FANID|$MSG"
  exit 0
fi

if [ "$ACTION" != "spawn" ]; then
  REASON=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('reason','unknown'))" 2>/dev/null)
  echo "DISPATCH_SKIP: $REASON"
  exit 0
fi

# Extract fan data for Opus worker
FANS=$(echo "$RESULT" | python3 -c "
import sys,json
data = json.load(sys.stdin)
fans = data.get('fans', [])
for f in fans:
    print(f'{f[\"fanId\"]}|{f.get(\"lastMessage\",\"\")}')
" 2>/dev/null)

echo "DISPATCH_SPAWN: $FANS"
