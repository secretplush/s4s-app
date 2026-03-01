#!/usr/bin/env python3
"""
Bianca Mass Bump System — Hourly cycle with OF exclude list management.
Deletes previous bump, syncs active chatters to exclude list, sends new bump.
"""
import json, sys, time, random, os, subprocess

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BASE = "https://app.onlyfansapi.com/api/acct_54e3119e77da4429b6537f7dd2883a05"
AUTH = "Bearer ofapi_bT4J1Er2YBow46EihDfjlSFf5HRmiM15M4DCOoHn7889d8b4"
STATE_FILE = os.path.join(SCRIPT_DIR, "bianca-mass-bump-state.json")
ACTIVE_CHATTERS_FILE = os.path.join(SCRIPT_DIR, "bianca-active-chatters.json")
BUMP_REGISTRY_FILE = os.path.join(SCRIPT_DIR, "bianca-bump-registry.json")

# Exclude lists: 5 existing SFS lists + active chatter list
SFS_EXCLUDE_LISTS = [1231455148, 1232110158, 1258116798, 1232588865, 1254929574]
ACTIVE_CHATTER_LIST_ID = 1265115686
ALL_EXCLUDE_LISTS = SFS_EXCLUDE_LISTS + [ACTIVE_CHATTER_LIST_ID]

CUTOFF_SECONDS = 3600  # 1 hour

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


def api(method, path, body=None):
    """API call via curl (urllib blocked by Cloudflare)."""
    url = f"{BASE}{path}"
    cmd = ["curl", "-s", "--max-time", "15", "-w", "\n%{http_code}", "-X", method,
           "-H", f"Authorization: {AUTH}", "-H", "Content-Type: application/json"]
    if body:
        cmd += ["-d", json.dumps(body)]
    cmd.append(url)
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=20)
        lines = result.stdout.rsplit("\n", 1)
        status_code = int(lines[-1]) if len(lines) > 1 else 0
        body_text = lines[0] if len(lines) > 1 else result.stdout
        try:
            data = json.loads(body_text)
        except Exception:
            data = {"raw": body_text[:200]}
        return status_code, data
    except Exception as e:
        return 0, {"error": str(e)}


def load_state():
    try:
        with open(STATE_FILE) as f:
            return json.load(f)
    except Exception:
        return {
            "last_mass_bump_id": None,
            "last_mass_bump_ts": None,
            "last_mass_bump_text": None,
            "bump_count": 0,
            "history": [],
            "exclude_list_members": []
        }


def save_state(state):
    with open(STATE_FILE, "w") as f:
        json.dump(state, f, indent=2)


def load_active_chatters():
    """Load active chatters file maintained by daemon."""
    try:
        with open(ACTIVE_CHATTERS_FILE) as f:
            return json.load(f)
    except FileNotFoundError:
        print("  ⚠️ No active-chatters file found")
        return {}
    except Exception as e:
        print(f"  ⚠️ Error reading active chatters: {e}")
        return {}


# ── Exclude List Management ──────────────────────────────────────────

def sync_excludes(state):
    """Sync active chatters to the OF exclude list. Add new active, remove expired."""
    now = time.time()
    cutoff = now - CUTOFF_SECONDS

    chatters = load_active_chatters()

    # Who should be on the list right now (chatted within last hour)
    should_be_on = set()
    for fan_id, info in chatters.items():
        if info.get("last_msg", 0) > cutoff:
            should_be_on.add(int(fan_id))

    # Who's currently tracked as on the list
    currently_on = set(state.get("exclude_list_members", []))

    to_add = should_be_on - currently_on
    to_remove = currently_on - should_be_on

    print(f"  Exclude list sync: {len(currently_on)} currently on, {len(should_be_on)} should be on")
    print(f"    Adding {len(to_add)}, removing {len(to_remove)}")

    # Add new active chatters
    if to_add:
        add_ids = sorted(to_add)
        print(f"    Adding to exclude list: {add_ids}")
        status, resp = api("POST", f"/user-lists/{ACTIVE_CHATTER_LIST_ID}/users", {"ids": add_ids})
        if status in (200, 201):
            print(f"    ✅ Added {len(add_ids)} users")
            currently_on.update(add_ids)
        else:
            print(f"    ❌ Add failed: {status} — {json.dumps(resp)[:200]}")

    # Remove expired chatters
    if to_remove:
        remove_ids = sorted(to_remove)
        print(f"    Removing from exclude list: {remove_ids}")
        status, resp = api("DELETE", f"/user-lists/{ACTIVE_CHATTER_LIST_ID}/users", {"ids": remove_ids})
        if status in (200, 201):
            print(f"    ✅ Removed {len(remove_ids)} users")
            currently_on -= set(remove_ids)
        else:
            print(f"    ❌ Remove failed: {status} — {json.dumps(resp)[:200]}")

    state["exclude_list_members"] = sorted(currently_on)
    return state


# ── Bump Operations ──────────────────────────────────────────────────

def delete_last(state, force_id=None):
    """Delete previous mass bump campaign."""
    bump_id = force_id or state.get("last_mass_bump_id")
    if not bump_id:
        print("  No previous mass bump ID to delete.")
        return False

    print(f"  Deleting mass bump {bump_id}...")
    status, resp = api("DELETE", f"/mass-messaging/{bump_id}")

    if status == 200 and resp.get("data", {}).get("success"):
        queue = resp["data"].get("queue", {})
        print(f"  ✅ Deleted: \"{queue.get('textCropped', '?')}\"")
        print(f"     Sent to {queue.get('sentCount', '?')} fans, {queue.get('viewedCount', '?')} viewed")
        if not force_id:
            state["last_mass_bump_id"] = None
        return True
    else:
        print(f"  ❌ Delete failed: {status} — {json.dumps(resp)[:200]}")
        return False


def send_bump(state):
    """Send new mass bump with all exclude lists."""
    msg_text = random.choice(BUMP_MESSAGES)
    photo_id = random.choice(BUMP_PHOTOS)

    body = {
        "text": msg_text,
        "mediaFiles": [photo_id],
        "userLists": ["fans", "following"],
        "excludeListIds": ALL_EXCLUDE_LISTS,
    }

    print(f"  Sending: \"{msg_text}\" + photo {photo_id}")
    print(f"  Exclude lists: {ALL_EXCLUDE_LISTS}")
    status, resp = api("POST", "/mass-messaging", body)

    if status in (200, 201) and resp.get("data"):
        bump_data = resp["data"]
        bump_id = bump_data.get("id")
        print(f"  ✅ Sent! mass_message_id={bump_id}, canUnsend={bump_data.get('canUnsend')}")

        # Write bump registry for daemon
        try:
            registry = {
                "bump_texts": BUMP_MESSAGES,
                "last_bump_ts": time.time(),
                "last_bump_text": msg_text,
                "last_bump_id": bump_id
            }
            with open(BUMP_REGISTRY_FILE, "w") as f:
                json.dump(registry, f, indent=2)
        except Exception as e:
            print(f"  ⚠️ Failed to write bump registry: {e}")

        # Update state
        state["last_mass_bump_id"] = bump_id
        state["last_mass_bump_ts"] = time.strftime("%Y-%m-%dT%H:%M:%S%z")
        state["last_mass_bump_text"] = msg_text
        state["bump_count"] = state.get("bump_count", 0) + 1
        state["history"].append({
            "id": bump_id, "text": msg_text, "photo": photo_id,
            "ts": state["last_mass_bump_ts"],
            "exclude_list_size": len(state.get("exclude_list_members", []))
        })
        state["history"] = state["history"][-20:]
        return True
    else:
        print(f"  ❌ Send failed: {status} — {json.dumps(resp)[:200]}")
        return False


def report(state):
    """Print status report."""
    print("\n=== MASS BUMP STATUS ===")
    print(f"Last bump ID:   {state.get('last_mass_bump_id', 'none')}")
    print(f"Last bump time: {state.get('last_mass_bump_ts', 'never')}")
    print(f"Last bump text: {state.get('last_mass_bump_text', 'n/a')}")
    print(f"Total sent:     {state.get('bump_count', 0)}")
    members = state.get("exclude_list_members", [])
    print(f"Exclude list:   {len(members)} active chatters")
    if members:
        print(f"  IDs: {members}")
    hist = state.get("history", [])
    if hist:
        print(f"\nRecent ({len(hist)}):")
        for h in hist[-5:]:
            print(f"  [{h.get('ts','?')}] id={h.get('id')} \"{h.get('text','?')}\" excl={h.get('exclude_list_size',0)}")
    print("========================\n")


# ── CLI ──────────────────────────────────────────────────────────────

def main():
    if len(sys.argv) < 2:
        print("Usage: python3 bianca-mass-bump.py <command>")
        print("  send           — full cycle: delete old → sync excludes → send new")
        print("  delete-last    — just delete the last bump")
        print("  sync-excludes  — just sync the exclude list")
        print("  report         — show status")
        return

    cmd = sys.argv[1]
    state = load_state()

    if cmd == "report":
        report(state)
        return

    if cmd == "delete-last":
        delete_last(state)
        save_state(state)
        return

    if cmd == "sync-excludes":
        print("Syncing exclude list...")
        sync_excludes(state)
        save_state(state)
        print("Done.")
        return

    if cmd == "send":
        ts = time.strftime("%Y-%m-%d %H:%M:%S")
        print(f"\n{'='*50}")
        print(f"BUMP CYCLE @ {ts}")
        print(f"{'='*50}")

        # Step 1: Delete previous bump
        print("\n[1/3] Delete previous bump")
        if state.get("last_mass_bump_id"):
            ok = delete_last(state)
            if not ok:
                print("  ⚠️ Delete failed — continuing anyway")
        else:
            print("  No previous bump to delete.")

        # Step 2: Sync exclude list
        print("\n[2/3] Sync exclude list")
        sync_excludes(state)

        # Step 3: Send new bump
        print("\n[3/3] Send new bump")
        ok = send_bump(state)

        save_state(state)

        if ok:
            print("\n✅ Bump cycle complete.")
        else:
            print("\n❌ Bump send failed.")

        report(state)
        return

    print(f"Unknown command: {cmd}")


if __name__ == "__main__":
    main()
