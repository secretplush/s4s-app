#!/usr/bin/env python3
"""
bianca-fetch-chat.py — Fetches and summarizes chat history for a fan.
Outputs a compact text summary suitable for inlining into an Opus worker task.

Usage: python3 research/bianca-fetch-chat.py <fanId> [limit]
"""

import sys
import json
import urllib.request

BASE = "https://app.onlyfansapi.com/api/acct_54e3119e77da4429b6537f7dd2883a05"
AUTH = "Bearer ofapi_bT4J1Er2YBow46EihDfjlSFf5HRmiM15M4DCOoHn7889d8b4"
BIANCA_ID = 525755724

def main():
    fan_id = sys.argv[1]
    limit = int(sys.argv[2]) if len(sys.argv) > 2 else 10

    url = f"{BASE}/chats/{fan_id}/messages?limit={limit}"
    req = urllib.request.Request(url)
    req.add_header("Authorization", AUTH)
    req.add_header("Content-Type", "application/json")
    req.add_header("User-Agent", "Mozilla/5.0")

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read())
    except urllib.error.HTTPError as e:
        if e.code == 429:
            print("ERROR_429")
        else:
            print(f"ERROR_{e.code}")
        sys.exit(1)

    messages = data if isinstance(data, list) else data.get("data", data.get("messages", data.get("list", [])))

    # Check if Bianca already replied after fan's last message
    def get_sender(msg):
        fu = msg.get("fromUser", {})
        return fu.get("id") if isinstance(fu, dict) else fu

    if messages:
        newest = messages[0]
        if get_sender(newest) == BIANCA_ID:
            print("ALREADY_REPLIED")
            sys.exit(0)

    # Build compact chat log (oldest first)
    lines = []
    for msg in reversed(messages):
        who = "Bianca" if get_sender(msg) == BIANCA_ID else "Fan"
        text = (msg.get("text") or "").replace("<p>", "").replace("</p>", "").strip()

        # Note PPV/media
        price = msg.get("price", 0) or 0
        is_opened = msg.get("isOpened")
        media_count = len(msg.get("media", []))

        extras = []
        if price > 0:
            extras.append(f"PPV ${price}" + (" OPENED" if is_opened else " unopened"))
        elif media_count > 0:
            extras.append(f"{media_count} media")

        suffix = f" [{', '.join(extras)}]" if extras else ""

        if text:
            # Truncate long messages
            if len(text) > 200:
                text = text[:200] + "..."
            lines.append(f"{who}: {text}{suffix}")
        elif extras:
            lines.append(f"{who}: [{'| '.join(extras)}]")

    print("\n".join(lines))

if __name__ == "__main__":
    main()
