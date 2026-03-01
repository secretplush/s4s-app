#!/bin/bash
# Fast cross-check using xargs parallel curl
AUTH="Authorization: Bearer ofapi_bT4J1Er2YBow46EihDfjlSFf5HRmiM15M4DCOoHn7889d8b4"
BASE="https://app.onlyfansapi.com/api"
RESULTS="/Users/moltplush/.openclaw/workspace/research/crosscheck_raw.jsonl"
TMPDIR="/Users/moltplush/.openclaw/workspace/research/tmp_crosscheck"
mkdir -p "$TMPDIR"

FANS="295453773 43172416 481908886 27764995 381722302 510689604 501131692 211167711 78758818 551946850 58225378 162040450 38538828 342825595 215896770 88782966 13773454 519252757 501611381 399320879 38344265 468724126 492892553 521251527 487661304 41935537 101145574 493284700 348044080 510229776 518394357 320188597 350190041 90144751 503122165 125176575 543223439 422303354 33047249 464862037 167878750 246990490 40938503 520047228 20351417 489700117 79975722 496210323 341301914 128404913 194494614 33350368 299370976 491929739 23740432 474227897 8363718 7592885 228155638 293592778 298389627 475383958 141738457 178706071 168076472 474329820 105439877 61041170 46125423 442138515 49453574"

# Get authenticated accounts
ACCOUNTS=$(curl -s -H "$AUTH" "$BASE/accounts" | python3 -c "
import json,sys
data=json.load(sys.stdin)
for a in data:
    if a.get('is_authenticated'):
        print(a['id'] + '|' + a['display_name'])
")

TOTAL_ACCTS=$(echo "$ACCOUNTS" | wc -l | tr -d ' ')
echo "Found $TOTAL_ACCTS authenticated accounts"

# Keep existing results
touch "$RESULTS"

ACCT_NUM=0
for acct_line in $ACCOUNTS; do
    ACCT_ID=$(echo "$acct_line" | cut -d'|' -f1)
    MODEL=$(echo "$acct_line" | cut -d'|' -f2)
    ACCT_NUM=$((ACCT_NUM + 1))
    
    # Check if already done
    if grep -q "\"account_id\":\"$ACCT_ID\"" "$RESULTS" 2>/dev/null; then
        echo "[$ACCT_NUM/$TOTAL_ACCTS] SKIP $MODEL"
        continue
    fi
    
    echo -n "[$ACCT_NUM/$TOTAL_ACCTS] $MODEL: "
    
    # Build curl commands for all fans and run 10 in parallel
    ACCT_TMP="$TMPDIR/$ACCT_ID"
    mkdir -p "$ACCT_TMP"
    
    for fan_id in $FANS; do
        echo "$fan_id"
    done | xargs -P 10 -I {} sh -c "
        curl -s -H '$AUTH' '$BASE/$ACCT_ID/users/{}' > '$ACCT_TMP/{}.json'
    "
    
    # Parse results
    FOUND=0
    SPENT=0
    for fan_id in $FANS; do
        F="$ACCT_TMP/$fan_id.json"
        [ -f "$F" ] || continue
        
        RESULT=$(python3 -c "
import json
try:
    with open('$F') as f:
        d=json.load(f)
    u=d.get('data',d)
    if u.get('subscribedBy'):
        so=u.get('subscribedOnData',{}) or {}
        print(json.dumps({
            'fan_id':$fan_id,
            'account_id':'$ACCT_ID',
            'model':'$MODEL',
            'name':u.get('name',''),
            'username':u.get('username',''),
            'totalSumm':so.get('totalSumm',0),
            'tipsSumm':so.get('tipsSumm',0),
            'messagesSumm':so.get('messagesSumm',0),
            'postsSumm':so.get('postsSumm',0),
            'subscribesSumm':so.get('subscribesSumm',0),
        }))
except:
    pass
" 2>/dev/null)
        
        if [ -n "$RESULT" ]; then
            echo "$RESULT" >> "$RESULTS"
            FOUND=$((FOUND + 1))
            T=$(echo "$RESULT" | python3 -c "import json,sys;print(json.load(sys.stdin).get('totalSumm',0))")
            if [ "$T" != "0" ]; then
                SPENT=$((SPENT + 1))
            fi
        fi
    done
    
    # Cleanup
    rm -rf "$ACCT_TMP"
    
    echo "$FOUND fans, $SPENT spenders"
done

echo ""
echo "=== DONE ==="
wc -l "$RESULTS"
