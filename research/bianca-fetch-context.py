#!/usr/bin/env python3
"""
Fetch context for Opus decision-only worker.
Usage: python3 bianca-fetch-context.py <fanId>

Outputs JSON to stdout:
{
  "fan_id": 12345,
  "messages": [...last 10 msgs, newest first...],
  "fan_state": {...compact state...},
  "sent_content": [...keys already sent via Redis...]
}

Each message: {"from":"fan"|"bianca", "text":"...", "price":null|N, "isOpened":null|bool, "ago":"2m"}
"""
import json, sys, os, subprocess, time
from datetime import datetime, timezone

DIR = os.path.dirname(os.path.abspath(__file__))
FAN_STATE_FILE = os.path.join(DIR, "bianca-fan-state.json")

OF_API = "https://app.onlyfansapi.com/api/acct_54e3119e77da4429b6537f7dd2883a05"
OF_KEY = "Bearer ofapi_bT4J1Er2YBow46EihDfjlSFf5HRmiM15M4DCOoHn7889d8b4"
RAILWAY = "https://s4s-worker-production.up.railway.app"
ACCOUNT_ID = "acct_54e3119e77da4429b6537f7dd2883a05"
BIANCA_ID = 525755724


def curl_json(url, headers=None, timeout=8):
    try:
        cmd = ["curl", "-s", "--max-time", str(timeout)]
        if headers:
            for k, v in headers.items():
                cmd += ["-H", f"{k}: {v}"]
        cmd.append(url)
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout + 3)
        return json.loads(r.stdout) if r.stdout.strip() else None
    except:
        return None


def load_json(path, default=None):
    try:
        with open(path) as f:
            return json.load(f)
    except:
        return default if default is not None else {}


def format_ago(created_at):
    try:
        t = datetime.fromisoformat(created_at)
        delta = (datetime.now(timezone.utc) - t).total_seconds()
        if delta < 60: return f"{int(delta)}s"
        if delta < 3600: return f"{int(delta/60)}m"
        if delta < 86400: return f"{int(delta/3600)}h"
        return f"{int(delta/86400)}d"
    except:
        return "?"


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "usage: bianca-fetch-context.py <fanId>"}))
        sys.exit(1)

    fan_id = int(sys.argv[1])
    fan_key = str(fan_id)

    # 1. Fetch last 15 messages (we'll trim to 10 after filtering)
    data = curl_json(f"{OF_API}/chats/{fan_id}/messages?limit=15",
                     headers={"Authorization": OF_KEY})
    
    messages = []
    if data:
        raw = data.get("data", data) if isinstance(data, dict) else data
        if isinstance(raw, list):
            for m in raw[:15]:
                from_id = m.get("fromUser", {}).get("id")
                text = m.get("text", "") or ""
                # Strip HTML
                import re
                text = re.sub(r"<[^>]+>", "", text).strip()
                
                msg = {
                    "from": "bianca" if from_id == BIANCA_ID else "fan",
                    "text": text[:200],  # Cap message length
                    "ago": format_ago(m.get("createdAt", ""))
                }
                
                price = m.get("price")
                if price:
                    msg["price"] = price
                    msg["isOpened"] = m.get("isOpened", False)
                
                # Track media for dedup
                media = m.get("media", [])
                if media and from_id == BIANCA_ID:
                    msg["had_media"] = True
                
                messages.append(msg)
    
    messages = messages[:10]  # Keep only 10

    # 2. Fan state (compact)
    all_state = load_json(FAN_STATE_FILE, {})
    fan_state = all_state.get(fan_key, {})
    
    # Compact: only essential fields
    compact_state = {}
    for k in ["buyerType", "totalSpent", "notes", "priceHistory"]:
        if k in fan_state and fan_state[k]:
            if k == "notes":
                compact_state[k] = fan_state[k][:300]  # Cap notes
            elif k == "priceHistory":
                compact_state[k] = fan_state[k][-5:]  # Last 5 prices
            else:
                compact_state[k] = fan_state[k]
    if fan_state.get("name"):
        compact_state["name"] = fan_state["name"]

    # 3. Sent content from Redis
    sent_content = []
    sent_data = curl_json(f"{RAILWAY}/fans/{ACCOUNT_ID}/{fan_id}/sent")
    if sent_data and isinstance(sent_data, list):
        sent_content = sent_data

    result = {
        "fan_id": fan_id,
        "messages": messages,
        "fan_state": compact_state,
        "sent_content": sent_content
    }
    
    print(json.dumps(result))


if __name__ == "__main__":
    main()
