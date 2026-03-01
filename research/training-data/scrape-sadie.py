#!/usr/bin/env python3
"""Scrape 5 sadieeblake fans across tiers. Store raw, then process."""

import json, subprocess, time, os

API = "https://app.onlyfansapi.com/api"
ACCT = "acct_cfb853d0ba714aeaa9a89e3026ec6190"
KEY = "ofapi_bT4J1Er2YBow46EihDfjlSFf5HRmiM15M4DCOoHn7889d8b4"
RAW_DIR = "research/training-data/raw/sadieeblake"
MAX_PAGES = 50  # 500 messages max per fan
TOTAL_CALL_CAP = 250

os.makedirs(RAW_DIR, exist_ok=True)

FANS = [
    {"id": 512524273, "name": "AnesthesiaDr", "tier": "whale", "spend": 5893.56},
    {"id": 21170885, "name": "Polska94", "tier": "big_buyer", "spend": 256.20},
    {"id": 472924159, "name": "Nathan", "tier": "buyer", "spend": 169.17},
    {"id": 108528695, "name": "Jayjay", "tier": "small", "spend": 31.84},
    {"id": 456212772, "name": "Kannnix", "tier": "zero", "spend": 0},
]

total_calls = 0
total_messages = 0
summary = []

for fan in FANS:
    fan_id = fan["id"]
    raw_path = f'{RAW_DIR}/{fan_id}.jsonl'
    fan_messages = 0
    fan_ppvs = 0
    fan_tips = 0
    fan_mass = 0
    money_moments = []
    
    print(f"\n{'='*60}")
    print(f"Scraping {fan['name']} ({fan['tier']}) — ${fan['spend']:.2f} total spend")
    print(f"{'='*60}")
    
    with open(raw_path, 'w') as f:
        offset = 0
        for page in range(MAX_PAGES):
            if total_calls >= TOTAL_CALL_CAP:
                print(f"⛔ HIT {TOTAL_CALL_CAP} CALL CAP — stopping")
                break
            
            url = f"{API}/{ACCT}/chats/{fan_id}/messages?limit=100&offset={offset}"
            r = subprocess.run(
                ['curl', '-s', url, '-H', f'Authorization: Bearer {KEY}'],
                capture_output=True, text=True, timeout=15
            )
            total_calls += 1
            
            try:
                data = json.loads(r.stdout)
            except:
                print(f"  ❌ JSON parse error on page {page}")
                break
            
            messages = data.get('data', data) if isinstance(data, dict) else data
            if not isinstance(messages, list) or len(messages) == 0:
                print(f"  ✅ End of conversation at page {page} ({fan_messages} messages)")
                break
            
            for msg in messages:
                # Write raw
                f.write(json.dumps(msg) + '\n')
                fan_messages += 1
                
                # Track money moments
                price = msg.get('price', 0) or 0
                is_tip = msg.get('isTip', False)
                is_queue = msg.get('isFromQueue', False)
                is_opened = msg.get('isOpened', False)
                from_user = msg.get('fromUser', {})
                from_id = from_user.get('id', 0)
                text = msg.get('text', '') or ''
                ts = msg.get('createdAt', '')
                media_count = msg.get('mediaCount', 0) or 0
                
                if is_queue:
                    fan_mass += 1
                
                if price > 0:
                    fan_ppvs += 1
                    moment_type = 'mass_ppv' if is_queue else 'direct_ppv'
                    money_moments.append({
                        'type': moment_type,
                        'price': price,
                        'opened': is_opened,
                        'media_count': media_count,
                        'from': 'chatter' if from_id != fan_id else 'fan',
                        'ts': ts,
                        'text_preview': text[:100]
                    })
                
                if is_tip:
                    fan_tips += 1
                    money_moments.append({
                        'type': 'tip',
                        'price': price,
                        'from': 'fan',
                        'ts': ts,
                        'text_preview': text[:100]
                    })
            
            offset += len(messages)
            
            if page % 10 == 0 and page > 0:
                print(f"  Page {page}: {fan_messages} messages so far, {len(money_moments)} money moments")
            
            time.sleep(0.15)  # Rate limit courtesy
    
    if total_calls >= TOTAL_CALL_CAP:
        # Still record what we got
        pass
    
    fan_summary = {
        'fan': fan['name'],
        'fan_id': fan_id,
        'tier': fan['tier'],
        'total_spend': fan['spend'],
        'messages_scraped': fan_messages,
        'api_calls_used': 'see total',
        'ppvs_found': fan_ppvs,
        'tips_found': fan_tips,
        'mass_messages': fan_mass,
        'direct_messages': fan_messages - fan_mass,
        'money_moments': len(money_moments),
        'money_moment_details': money_moments[:20],  # First 20 for summary
    }
    summary.append(fan_summary)
    
    print(f"  📊 {fan_messages} messages | {fan_ppvs} PPVs | {fan_tips} tips | {fan_mass} mass msgs | {fan_messages - fan_mass} direct")
    
    total_messages += fan_messages
    
    if total_calls >= TOTAL_CALL_CAP:
        print(f"\n⛔ TOTAL CAP REACHED: {total_calls} calls")
        break

print(f"\n{'='*60}")
print(f"SCRAPE COMPLETE")
print(f"{'='*60}")
print(f"Total API calls: {total_calls}")
print(f"Total messages: {total_messages}")
print(f"Fans scraped: {len(summary)}")

# Save summary
summary_path = 'research/training-data/raw/sadieeblake/scrape-summary.json'
with open(summary_path, 'w') as f:
    json.dump({
        'model': 'sadieeblake',
        'account_id': ACCT,
        'scrape_date': time.strftime('%Y-%m-%dT%H:%M:%S'),
        'total_api_calls': total_calls,
        'total_messages': total_messages,
        'fans': summary
    }, f, indent=2)

print(f"\nSummary saved to {summary_path}")

# Quick money moments overview
print(f"\n{'='*60}")
print(f"MONEY MOMENTS OVERVIEW")
print(f"{'='*60}")
for s in summary:
    print(f"\n{s['fan']} ({s['tier']}) — ${s['total_spend']:.2f}")
    print(f"  {s['messages_scraped']} msgs ({s['direct_messages']} direct, {s['mass_messages']} mass)")
    print(f"  {s['ppvs_found']} PPVs, {s['tips_found']} tips")
    for mm in s['money_moment_details'][:5]:
        status = '✅ opened' if mm.get('opened') else '❌ unopened'
        print(f"    ${mm['price']:.2f} {mm['type']} {status} — {mm['ts'][:16]}")
