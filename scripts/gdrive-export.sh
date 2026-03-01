#!/bin/bash
# Daily export of chatbot conversations from Railway Redis to Google Drive
# Requires: rclone configured with 'gdrive' remote

EXPORT_DIR="/Users/moltplush/.openclaw/workspace/exports"
RAILWAY_URL="https://s4s-worker-production.up.railway.app"
DATE=$(date +%Y-%m-%d)

mkdir -p "$EXPORT_DIR/conversations"

echo "📥 Dumping conversations from Railway..."
curl -s "$RAILWAY_URL/chatbot/relay/dump" | python3 -c "
import sys, json, csv, os

data = json.load(sys.stdin)
convos = data.get('conversations', {})
export_dir = '$EXPORT_DIR/conversations'

for user_id, messages in convos.items():
    filename = f'{export_dir}/fan_{user_id}_{\"$DATE\"}.csv'
    with open(filename, 'w', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(['timestamp', 'role', 'message'])
        for msg in messages:
            ts = msg.get('at', '')
            role = msg.get('role', '?')
            content = msg.get('content', '')
            writer.writerow([ts, role, content])
    print(f'  Exported {len(messages)} messages for fan {user_id}')

print(f'Total conversations: {len(convos)}')
"

echo "📤 Syncing to Google Drive..."
if rclone listremotes | grep -q "gdrive:"; then
    rclone copy "$EXPORT_DIR/conversations/" "gdrive:Plush Chatbot/conversations/$DATE/" --progress
    echo "✅ Synced to Google Drive"
else
    echo "⚠️ Google Drive not configured yet. Files saved locally at: $EXPORT_DIR/conversations/"
    echo "Run: rclone config  to set up 'gdrive' remote"
fi
