#!/bin/bash

# OnlyFansAPI Tag Test Script
# Post ID: 2258118459 (created at 2026-02-05T05:05:08Z)

API_KEY="ofapi_bT4J1Er2YBow46EihDfjlSFf5HRmiM15M4DCOoHn7889d8b4"
ACCOUNT_ID="acct_5802030761bb4184a4347e90ce55db40"
POST_ID="2258118459"
CAPTION="my friend @zoeemonroe just started OF and is ready to show you everything 😈"

echo "=========================================="
echo "OnlyFans API Tag Test"
echo "Time: $(date)"
echo "=========================================="

# Step 1: Wait 5 minutes then delete
echo ""
echo "[1/4] Post is live. Waiting 5 minutes before delete..."
sleep 300

echo "[2/4] Deleting post $POST_ID..."
DELETE_RESULT=$(curl -s -X DELETE "https://app.onlyfansapi.com/api/$ACCOUNT_ID/posts/$POST_ID" \
  -H "Authorization: Bearer $API_KEY")
echo "Delete result: $DELETE_RESULT"
echo "Post deleted at: $(date)"

# Step 2: Wait 5 minutes then repost
echo ""
echo "[3/4] Waiting 5 minutes before reposting..."
sleep 300

echo "Reposting..."
REPOST_RESULT=$(curl -s -X POST "https://app.onlyfansapi.com/api/$ACCOUNT_ID/posts" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"text\": \"$CAPTION\"}")
NEW_POST_ID=$(echo $REPOST_RESULT | jq -r '.data.id')
echo "New post created: $NEW_POST_ID"
echo "Reposted at: $(date)"

# Step 3: Wait 5 minutes then delete again
echo ""
echo "[4/4] Waiting 5 minutes before final delete..."
sleep 300

echo "Final delete of post $NEW_POST_ID..."
FINAL_DELETE=$(curl -s -X DELETE "https://app.onlyfansapi.com/api/$ACCOUNT_ID/posts/$NEW_POST_ID" \
  -H "Authorization: Bearer $API_KEY")
echo "Final delete result: $FINAL_DELETE"

echo ""
echo "=========================================="
echo "TEST COMPLETE at $(date)"
echo "=========================================="
