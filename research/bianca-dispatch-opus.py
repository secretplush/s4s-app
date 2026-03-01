#!/usr/bin/env python3
"""
Dispatch a single fan to Opus using compact prompt.
Usage: python3 bianca-dispatch-opus.py <fan_id>

Builds minimal context (~400 tokens), prints the Opus task for sessions_spawn.
Content selection + pricing handled by content picker — NOT Opus.
"""
import json, sys, os, re
import urllib.request

DIR = os.path.dirname(os.path.abspath(__file__))
OF_API = "https://app.onlyfansapi.com/api/acct_54e3119e77da4429b6537f7dd2883a05"
OF_KEY = "Bearer ofapi_bT4J1Er2YBow46EihDfjlSFf5HRmiM15M4DCOoHn7889d8b4"
BIANCA_ID = 525755724

def api_get(path):
    req = urllib.request.Request(f"{OF_API}{path}", headers={"Authorization": OF_KEY})
    resp = urllib.request.urlopen(req, timeout=10)
    return json.loads(resp.read())

def load_json(path, default=None):
    try:
        with open(path) as f: return json.load(f)
    except: return default or {}

def strip_html(text):
    return re.sub(r'<[^>]+>', '', text or '').strip()

def get_fan_state(fan_id):
    """Load fan state from both state files, merge into one."""
    # Old per-fan files
    old_state = load_json(os.path.join(DIR, f"bot-state/biancawoods/{fan_id}.json"), {})
    # New central state
    central = load_json(os.path.join(DIR, "bianca-fan-state.json"), {})
    new_state = central.get(str(fan_id), {})
    
    # Merge — new state wins
    merged = {
        "totalSpent": new_state.get("totalSpent", old_state.get("total_spent", 0)),
        "purchaseCount": new_state.get("purchaseCount", old_state.get("purchases", old_state.get("purchase_count", 0))),
        "content_sent": new_state.get("content_sent", old_state.get("content_sent", [])),
        "messages_sent": new_state.get("messages_sent", old_state.get("messages_sent", 0)),
        "state": new_state.get("state", old_state.get("state", "new")),
    }
    return merged

def build_context(fan_id):
    """Build minimal context for Opus — target <400 tokens total."""
    fan_id = int(fan_id)
    state = get_fan_state(fan_id)
    
    # Last 5 messages from OF API
    try:
        data = api_get(f"/chats/{fan_id}/messages?limit=5")
        msgs = data.get("data", [])
        chat_lines = []
        for m in reversed(msgs):
            who = "b" if m.get("fromUser", {}).get("id") == BIANCA_ID else "f"
            text = strip_html(m.get("text", ""))[:80]
            price = m.get("price", 0)
            if price:
                purchased = not m.get("canPurchase", True)
                text += f" [${price} PPV{' ✅' if purchased else ''}]"
            chat_lines.append(f"[{who}] {text}")
    except:
        chat_lines = ["[error fetching messages]"]
    
    # Determine stage label
    spent = state["totalSpent"]
    buys = state["purchaseCount"]
    if spent >= 100:
        stage = "whale"
    elif spent > 0:
        stage = "buyer"
    elif buys > 0:
        stage = "purchased"
    else:
        stage = "new"
    
    # Compact fan summary — only what Opus needs to write the right MESSAGE
    fan_summary = json.dumps({
        "id": fan_id,
        "spent": spent,
        "buys": buys,
        "stage": stage,
    })
    
    # Load compact prompt
    with open(os.path.join(DIR, "bianca-prompt-compact.md")) as f:
        prompt = f.read()
    
    task = f"""{prompt}
FAN: {fan_summary}
CHAT:
{chr(10).join(chat_lines)}

Output ONE JSON line. Content + price auto-selected — just pick action + intent + message."""
    
    return task

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 bianca-dispatch-opus.py <fan_id>", file=sys.stderr)
        sys.exit(1)
    fan_id = sys.argv[1]
    task = build_context(fan_id)
    print(task)
    est_tokens = len(task) // 4
    print(f"\n--- ~{est_tokens} tokens ---", file=sys.stderr)
