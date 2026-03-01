#!/usr/bin/env python3
"""
Bianca Bump System — Pure Python, zero AI.
1. Unsend previous mass message (if tracked)
2. Send new mass message with random photo + text
3. Track message ID for next unsend
Runs every hour via launchd.
"""
import json, sys, time, random, os, subprocess

BASE = "https://app.onlyfansapi.com/api/acct_54e3119e77da4429b6537f7dd2883a05"
AUTH = "Bearer ofapi_bT4J1Er2YBow46EihDfjlSFf5HRmiM15M4DCOoHn7889d8b4"
DIR = os.path.dirname(os.path.abspath(__file__))
STATE_FILE = os.path.join(DIR, "bianca-bump-state.json")
LOG_FILE = os.path.join(DIR, "bianca-bump.log")

# SFS exclude list IDs (whales + VIPs)
SFS_EXCLUDE_LISTS = [1231455148, 1232110158, 1258116798, 1232588865, 1254929574]

BUMP_PHOTOS = [
    "4295115634", "4295115608", "4271207724", "4128847737", "4118094254",
    "4118094218", "4084333700", "4084332834", "4084332833", "4084332827",
    "4084332825", "4084332375", "4084332371", "4084332368", "4084332364",
    "4084331945", "4084331943", "4084331942", "4083927398", "4083927388",
    "4083927385", "4083927380", "4083927378", "4083927375"
]

BUMP_MESSAGES = [
    "heyyy u 💕 been thinking about u",
    "bored and looking cute rn 😏 wanna see?",
    "miss talking to u 🥺",
    "just took this for u 📸",
    "are u ignoring me 😤💕",
    "pssst 😘",
    "hiiii remember me? 🙈",
]


def log(msg):
    ts = time.strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line)
    try:
        with open(LOG_FILE, "a") as f:
            f.write(line + "\n")
    except:
        pass


def api(method, path, body=None, timeout=15):
    url = f"{BASE}{path}"
    cmd = ["curl", "-s", "--max-time", str(timeout), "-w", "\n%{http_code}",
           "-X", method, "-H", f"Authorization: {AUTH}",
           "-H", "Content-Type: application/json"]
    if body:
        cmd += ["-d", json.dumps(body)]
    cmd.append(url)
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout + 5)
        lines = result.stdout.rsplit("\n", 1)
        status = int(lines[-1]) if len(lines) > 1 else 0
        body_text = lines[0] if len(lines) > 1 else result.stdout
        try:
            data = json.loads(body_text)
        except:
            data = {"raw": body_text[:200]}
        return status, data
    except Exception as e:
        return 0, {"error": str(e)}


def load_state():
    try:
        with open(STATE_FILE) as f:
            return json.load(f)
    except:
        return {"last_mass_msg_id": None, "last_run": None, "total_sent": 0, "total_unsent": 0}


def save_state(state):
    with open(STATE_FILE, "w") as f:
        json.dump(state, f, indent=2)


def get_active_fan_ids():
    """Get fans with active chats in last 2 hours — exclude from mass bump."""
    from datetime import datetime, timezone
    active = []
    cutoff = time.time() - 7200
    # Only check page 1 (10 chats) — fast
    status, data = api("GET", "/chats?limit=10&order=recent&offset=0")
    if status != 200:
        return []
    chats = data.get("data", data) if isinstance(data, dict) else data
    if not isinstance(chats, list):
        return []
    for c in chats:
        lm = c.get("lastMessage", {})
        fan = c.get("fan", {})
        fan_id = fan.get("id")
        created = lm.get("createdAt", "")
        if not fan_id or not created:
            continue
        try:
            dt = datetime.fromisoformat(created)
            if dt.timestamp() > cutoff:
                active.append(fan_id)
        except:
            pass
    return active


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "send"
    state = load_state()

    if mode == "report":
        log(f"State: {json.dumps(state, indent=2)}")
        return

    # STEP 1: Unsend previous mass message
    prev_id = state.get("last_mass_msg_id")
    if prev_id:
        log(f"Unsending previous mass msg {prev_id}...")
        status, resp = api("DELETE", f"/mass-messages/{prev_id}")
        if status == 200:
            log(f"  ✅ Unsent {prev_id}")
            state["total_unsent"] = state.get("total_unsent", 0) + 1
        else:
            log(f"  ⚠️ Unsend failed ({status}): {str(resp)[:100]}")
        state["last_mass_msg_id"] = None
        save_state(state)
    else:
        log("No previous mass msg to unsend.")

    if mode == "unsend":
        save_state(state)
        return

    # STEP 2: Get active fans to exclude
    active_fans = get_active_fan_ids()
    log(f"Active fans excluded: {len(active_fans)}")

    # STEP 3: Send new mass message
    msg_text = random.choice(BUMP_MESSAGES)
    photo_id = random.choice(BUMP_PHOTOS)

    body = {
        "text": msg_text,
        "mediaFiles": [photo_id],
        "excludeListIds": SFS_EXCLUDE_LISTS,
    }
    if active_fans:
        body["excludeUserIds"] = active_fans

    log(f"Sending mass bump: \"{msg_text}\" + photo {photo_id}")
    log(f"  Excluding {len(SFS_EXCLUDE_LISTS)} lists + {len(active_fans)} active fans")

    status, resp = api("POST", "/mass-messages", body, timeout=30)

    if status == 200 or status == 201:
        msg_data = resp.get("data", resp)
        msg_id = msg_data.get("id") or msg_data.get("queueId")
        state["last_mass_msg_id"] = msg_id
        state["total_sent"] = state.get("total_sent", 0) + 1
        state["last_run"] = time.strftime("%Y-%m-%dT%H:%M:%S%z")
        log(f"  ✅ Mass msg sent → ID {msg_id}")
    else:
        log(f"  ❌ Failed ({status}): {str(resp)[:200]}")
        if status == 429:
            log("  ⚠️ Rate limited — will retry next cycle")

    save_state(state)
    log("Done.")


if __name__ == "__main__":
    main()
