#!/usr/bin/env python3
"""
Scrape conversations for fans in $10-500 spend tier.
Hard cap on API credits. Writes incrementally to disk.
"""

import subprocess, json, time, sys, os
from pathlib import Path

ACCT = sys.argv[1]  # account ID
MODEL = sys.argv[2]  # model name for folder
CREDIT_CAP = int(sys.argv[3]) if len(sys.argv) > 3 else 3000
TOKEN = 'ofapi_bT4J1Er2YBow46EihDfjlSFf5HRmiM15M4DCOoHn7889d8b4'
BASE = 'https://app.onlyfansapi.com/api'

RAW_DIR = Path(f'research/training-data/raw/{MODEL}')
RAW_DIR.mkdir(parents=True, exist_ok=True)
STATE_FILE = RAW_DIR / '_scrape-state.json'
FANS_FILE = Path(f'research/training-data/raw/{MODEL}-fans.jsonl')

credits_used = 0

def api_call(endpoint):
    global credits_used
    if credits_used >= CREDIT_CAP:
        return None
    r = subprocess.run(
        ['curl', '-s', f'{BASE}/{ACCT}/{endpoint}', '-H', f'Authorization: Bearer {TOKEN}'],
        capture_output=True, text=True, timeout=15
    )
    credits_used += 1
    try:
        return json.loads(r.stdout)
    except:
        return None

def save_state(state):
    with open(STATE_FILE, 'w') as f:
        json.dump(state, f, indent=2)

# Load existing state if resuming
state = {}
if STATE_FILE.exists():
    with open(STATE_FILE) as f:
        state = json.load(f)

# Load fan list
if not FANS_FILE.exists():
    print(f"ERROR: {FANS_FILE} not found. Run fan list pull first.")
    sys.exit(1)

fans = []
seen = set()
with open(FANS_FILE) as f:
    for line in f:
        fan = json.loads(line)
        if fan['id'] not in seen:
            seen.add(fan['id'])
            fans.append(fan)

# Filter to $10-500 tier, skip already scraped
target_fans = [f for f in fans if 10 < f['total'] <= 500]
target_fans.sort(key=lambda f: f['total'], reverse=True)  # highest spenders first

already_scraped = set(state.get('completed', []))
# Also check for existing files
for jsonl in RAW_DIR.glob('*.jsonl'):
    try:
        fid = int(jsonl.stem)
        already_scraped.add(fid)
    except ValueError:
        pass

remaining = [f for f in target_fans if f['id'] not in already_scraped]

print(f"Model: {MODEL}")
print(f"Target fans ($10-500): {len(target_fans)}")
print(f"Already scraped: {len(already_scraped)}")
print(f"Remaining: {len(remaining)}")
print(f"Credit cap: {CREDIT_CAP}")
print(f"", flush=True)

completed = list(already_scraped)
fans_scraped = 0
total_msgs = 0
total_ppvs = 0

for fan in remaining:
    if credits_used >= CREDIT_CAP:
        print(f"\n⛔ CREDIT CAP HIT ({CREDIT_CAP}). Stopping.", flush=True)
        break
    
    fan_id = fan['id']
    fan_msgs = []
    fan_ppvs = 0
    pages = 0
    
    while credits_used < CREDIT_CAP:
        data = api_call(f'chats/{fan_id}/messages?limit=10&offset={pages*10}&order=desc')
        if data is None:
            break
        msgs = data.get('data', []) if isinstance(data, dict) else data if isinstance(data, list) else []
        if not msgs:
            break
        fan_msgs.extend(msgs)
        fan_ppvs += sum(1 for m in msgs if m.get('price'))
        pages += 1
        time.sleep(0.15)
    
    # Save fan conversation
    outfile = RAW_DIR / f'{fan_id}.jsonl'
    with open(outfile, 'w') as f:
        for m in fan_msgs:
            f.write(json.dumps(m) + '\n')
    
    completed.append(fan_id)
    fans_scraped += 1
    total_msgs += len(fan_msgs)
    total_ppvs += fan_ppvs
    
    print(f"[{credits_used}/{CREDIT_CAP}] {fan.get('username') or fan_id} (${fan['total']:.0f}): {len(fan_msgs)} msgs, {fan_ppvs} PPVs, {pages} calls", flush=True)
    
    # Save state every 5 fans
    if fans_scraped % 5 == 0:
        save_state({
            'completed': completed,
            'credits_used': credits_used,
            'fans_scraped': fans_scraped,
            'total_msgs': total_msgs,
        })

# Final state save
save_state({
    'completed': completed,
    'credits_used': credits_used,
    'fans_scraped': fans_scraped,
    'total_msgs': total_msgs,
    'total_ppvs': total_ppvs,
    'finished': credits_used < CREDIT_CAP,
})

print(f"\n{'='*50}")
print(f"DONE: {fans_scraped} fans scraped")
print(f"Total messages: {total_msgs}")
print(f"Total PPVs: {total_ppvs}")
print(f"Credits used: {credits_used}/{CREDIT_CAP}")
print(f"Remaining fans: {len(remaining) - fans_scraped}")
