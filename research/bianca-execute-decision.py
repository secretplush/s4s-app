#!/usr/bin/env python3
"""
Execute Opus decision for Bianca chatbot.
Usage: python3 bianca-execute-decision.py <fanId> '<json_decision>'

Takes the JSON decision from Opus and:
1. Validates content_key
2. Looks up vault IDs
3. Sends via OF API
4. Updates PPV ledger + fan state
5. Records metrics/latency
6. Updates fan memory (last_seen_message_id)

Outputs: JSON result to stdout
"""
import json, sys, os, subprocess, time, re
from datetime import datetime, timezone

DIR = os.path.dirname(os.path.abspath(__file__))

OF_API = "https://app.onlyfansapi.com/api/acct_54e3119e77da4429b6537f7dd2883a05"
OF_KEY = "Bearer ofapi_bT4J1Er2YBow46EihDfjlSFf5HRmiM15M4DCOoHn7889d8b4"
RAILWAY = "https://s4s-worker-production.up.railway.app"
ACCOUNT_ID = "acct_54e3119e77da4429b6537f7dd2883a05"
BIANCA_ID = 525755724

FAN_STATE_FILE = os.path.join(DIR, "bianca-fan-state.json")
FAN_MEMORY_FILE = os.path.join(DIR, "bianca-fan-memory.json")
METRICS_FILE = os.path.join(DIR, "bianca-metrics.json")
OPUS_CALLS_FILE = os.path.join(DIR, "bianca-opus-calls.json")
SYSTEM_STATE_FILE = os.path.join(DIR, "bianca-system-state.json")

# ==================== VAULT MAP ====================
# content_key → list of vault IDs
VAULT_MAP = {
    # Free hooks
    "gfe_selfie": ["4129214996", "4129214993", "4118094231", "4118094226", "4113019829", "4113019824", "4113019823", "4113019822", "4113019819", "4112955857", "4112955856"],
    "booty_pic": ["4161285101", "4084340188", "4084340187", "4084340182", "4084340161"],
    "bump": ["4295115634", "4295115608", "4271207724", "4128847737", "4118094254", "4118094218", "4084333700", "4084332834", "4084332833", "4084332827"],
    "rekindle_vid": ["4208184080", "4142976927", "4142976472"],
    
    # Sexting chain pics (free)
    "sexting1_pic": ["4084442782"],
    "sexting2_pic": ["4100912693"],
    "sexting3_pic": ["4156205024"],
    
    # Sexting chain vids
    "sexting1_vid_15": ["4084442804"], "sexting1_vid_24": ["4084442810"],
    "sexting1_vid_38": ["4084442819"], "sexting1_vid_54": ["4084442829"],
    "sexting1_vid_75": ["4084442833"],
    
    "sexting2_vid_15": ["4100912696"], "sexting2_vid_24": ["4100912699"],
    "sexting2_vid_38": ["4100912703"], "sexting2_vid_54": ["4100912708"],
    "sexting2_vid_75": ["4100912711"],
    
    "sexting3_vid_15": ["4156205030"], "sexting3_vid_24": ["4156205035"],
    "sexting3_vid_38": ["4156205039"], "sexting3_vid_54": ["4156205044"],
    "sexting3_vid_75": ["4156205051"], "sexting3_vid_100": ["4161281036"],
    
    # Bundles
    "bundle1": ["4095109757", "4084340351", "4084340350", "4084340349", "4084340348"],
    "bundle2": ["4084508911", "4084384391", "4084340188", "4084340187", "4084340183", "4084340182", "4084340178", "4084340177", "4084340174", "4084340168", "4084340161"],
    "bundle3": ["4095109759", "4084340160", "4084340156", "4084340155", "4084340152", "4084340151", "4084340143", "4084340141", "4084340138", "4084340134", "4084340132"],
    "bundle4": ["4095109760", "4084339349", "4084339348", "4084339347", "4084339346", "4084339345"],
    "bundle5": ["4095109765", "4084352226", "4084352221", "4084352219", "4084352217", "4084352214", "4084352208", "4084352203", "4084352179"],
    "bundle6": ["4090853530", "4084384389", "4084352202", "4084352199", "4084352183", "4084352180"],
    "bundle7": ["4095109773", "4084339337", "4084339336", "4084339335", "4084339334", "4084339333", "4084339331", "4084339330", "4084339325"],
    "bundle8": ["4095109767", "4084384387", "4084339324", "4084339323", "4084339320", "4084339319"],
    "bundle9": ["4163079923", "4161285098", "4161285094", "4161285093", "4161285090"],
    "bundle10": ["4178636800", "4161285101", "4161285097", "4161285092", "4161285091"],
    "bundle11": ["4182101058", "4176760767", "4176760766", "4176760765", "4176760763", "4176760761", "4176760760", "4176760759", "4176760758", "4176760757", "4176760754", "4176760753"],
    "bundle12": ["4184130158", "4176762659", "4176762658", "4176762655", "4176762654", "4176762653", "4176762652", "4176762650", "4176762649", "4176762647", "4176762645", "4176762644", "4176762643", "4176762641"],
    "bundle13": ["4187068301", "4176764449", "4176764448", "4176764447", "4176764444", "4176764443", "4176764442", "4176764441", "4176764440", "4176764439", "4176764438", "4176764436"],
    "bundle14": ["4190352077", "4161405222", "4161405220", "4161405218", "4161405217", "4161405215", "4161405213", "4161405212", "4161405211", "4161405210", "4161405209", "4161405206"],
    "bundle15": ["4190618896", "4166315392", "4161407774", "4161407771", "4161407769", "4161407767", "4161407765", "4161407763", "4161407760", "4161407759", "4161407758", "4161407757", "4161407756"],
    "bundle16": ["4193745219", "4166578144", "4166578143", "4166578142", "4166578141", "4166578140", "4166578139", "4166578138", "4166578136", "4166578135", "4166578134", "4166578131", "4166578128", "4166578127"],
    "bundle17": ["4194216128", "4166589335", "4166589331", "4166589329", "4166589327", "4166589326", "4166589325", "4166589324", "4166589323", "4166589322", "4166589319"],
    "bundle18": ["4201723400", "4177896625", "4177896623", "4177896621", "4177896620", "4177896618", "4177896615", "4177896613", "4177896612", "4177896610", "4177896609", "4177896608"],
    "bundle19": ["4166383225", "4166383222", "4166383220", "4166383218", "4166383215"],
    "bundle20": ["4242088817", "4242088813", "4242088812", "4242088811", "4242088810", "4242088808", "4242088805", "4242088802", "4242088801", "4242088796"],
    "bundle21": ["4245488102", "4245488099", "4245488097", "4245488096", "4245488095", "4245488093", "4245488092", "4245488091", "4245488090", "4245488089"],
    "bundle22": ["4245491586", "4245491585", "4245491583", "4245491582", "4245491580", "4245491579", "4245491577", "4245491575", "4245491574"],
    "bundle23": ["4292078295", "4250784656", "4250784655", "4250784654", "4250784653", "4250784649", "4250784647", "4250784646", "4250784639"],
    "bundle24": ["4250791307", "4250791305", "4250791302", "4250791301", "4250791300", "4250791298", "4250791297", "4250791294"],
    "bundle25": ["4251042040", "4251042039", "4251042037", "4251042036", "4251042035", "4251042034", "4251042032", "4251042030", "4251042029"],
    "bundle26": ["4257179556", "4257179555", "4257179554", "4257179550", "4257179547", "4257179546", "4257179536", "4257179535", "4257179533", "4257179524", "4257179522", "4257179520", "4257179516"],
    
    # High ticket placeholders (handled specially)
    "starter_pack": "HIGH_TICKET",
    "best_of": "HIGH_TICKET",
    "everything": "HIGH_TICKET",
    
    # Combo bundles: 2 videos + 10 photos each
    "combo1": ["4084508911", "4182101058", "4084384391", "4084340188", "4084340187", "4176760767", "4176760766", "4176760765", "4095109757", "4084340351", "4084340350", "4084340349"],
    "combo2": ["4090853530", "4184130158", "4084384389", "4084352202", "4084352199", "4176762659", "4176762658", "4176762655", "4095109759", "4084340160", "4084340156", "4084340155"],
    "combo3": ["4095109767", "4187068301", "4084384387", "4084339324", "4084339323", "4176764449", "4176764448", "4176764447", "4095109760", "4084339349", "4084339348", "4084339347"],
    "combo4": ["4084508911", "4190352077", "4084384391", "4084340188", "4084340187", "4161405222", "4161405220", "4161405218", "4095109765", "4084352226", "4084352221", "4084352219"],
    "combo5": ["4090853530", "4190618896", "4084384389", "4084352202", "4084352199", "4166315392", "4161407774", "4161407771", "4095109773", "4084339337", "4084339336", "4084339335"],
    "combo6": ["4095109767", "4193745219", "4084384387", "4084339324", "4084339323", "4166578144", "4166578143", "4166578142", "4163079923", "4161285098", "4161285094", "4161285093"],
    "combo7": ["4182101058", "4194216128", "4176760767", "4176760766", "4176760765", "4166589335", "4166589331", "4166589329", "4178636800", "4161285101", "4161285097", "4161285092"],
    "combo8": ["4184130158", "4201723400", "4176762659", "4176762658", "4176762655", "4177896625", "4177896623", "4177896621", "4166383225", "4166383222", "4166383220", "4166383218"],
    "combo9": ["4187068301", "4190352077", "4176764449", "4176764448", "4176764447", "4161405222", "4161405220", "4161405218", "4242088817", "4242088813", "4242088812", "4242088811"],
    "combo10": ["4190618896", "4193745219", "4166315392", "4161407774", "4161407771", "4166578144", "4166578143", "4166578142", "4245488102", "4245488099", "4245488097", "4245488096"],
    "combo11": ["4194216128", "4201723400", "4166589335", "4166589331", "4166589329", "4177896625", "4177896623", "4177896621", "4245491586", "4245491585", "4245491583", "4245491582"],
    "combo12": ["4182101058", "4190618896", "4176760767", "4176760766", "4176760765", "4166315392", "4161407774", "4161407771", "4292078295", "4250784656", "4250784655", "4250784654"],
    "combo13": ["4184130158", "4193745219", "4176762659", "4176762658", "4176762655", "4166578144", "4166578143", "4166578142", "4250791307", "4250791305", "4250791302", "4250791301"],
    
    # Custom upsells
    "custom_tier1_shower": ["4242780548", "4240412927", "4132819366", "4112437083", "4109660005", "4107908001", "4106671990", "4095915546", "4095915531", "4095915525", "4095915510", "4095915495", "4095915490"],
    "custom_tier2_bedroom": ["4242538532", "4240412930", "4141551599", "4132819369", "4107923734", "4101091755"],
    "custom_tier3_topless": ["4241155807", "4240495621", "4125482011", "4112437075", "4108475260", "4108475253", "4108475241", "4108475237"],
    "custom_tier4_rubbing": ["4244605437", "4240495624", "4138951601", "4130805983", "4130793373", "4130787911", "4130764880"],
    "custom_tier5_titty": ["4240495622", "4141597798", "4116444565"],
    "custom_tier6_tryon": ["4141649812", "4132819370"],
    "custom_tier7_cumming": ["4243623154", "4240495623", "4141698164", "4139431932", "4139422853", "4139401380", "4139381132", "4139287517"],
}


def curl_json(url, headers=None, method="GET", body=None, timeout=10):
    try:
        cmd = ["curl", "-s", "--max-time", str(timeout)]
        if method == "POST":
            cmd += ["-X", "POST"]
        if headers:
            for k, v in headers.items():
                cmd += ["-H", f"{k}: {v}"]
        if body:
            cmd += ["-H", "Content-Type: application/json", "-d", json.dumps(body)]
        cmd.append(url)
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout + 3)
        if r.returncode != 0:
            return {"error": f"curl exit {r.returncode}"}
        if "429" in r.stdout[:20] or "Too Many" in r.stdout[:50]:
            return {"error": "429"}
        return json.loads(r.stdout) if r.stdout.strip() else {"error": "empty"}
    except Exception as e:
        return {"error": str(e)}


def load_json(path, default=None):
    try:
        with open(path) as f:
            return json.load(f)
    except:
        return default if default is not None else {}


def save_json(path, data):
    with open(path, "w") as f:
        json.dump(data, f, indent=2)


def now_ms():
    return int(time.time() * 1000)


def pick_random(items, count=1):
    import random
    if len(items) <= count:
        return items
    return random.sample(items, count)


def main():
    if len(sys.argv) < 3:
        print(json.dumps({"error": "usage: bianca-execute-decision.py <fanId> '<json>'"}))
        sys.exit(1)

    fan_id = int(sys.argv[1])
    
    try:
        decision = json.loads(sys.argv[2])
    except:
        print(json.dumps({"error": "invalid JSON decision", "raw": sys.argv[2][:200]}))
        sys.exit(1)

    action = decision.get("action", "skip")
    content_key = decision.get("content_key", "")
    price = decision.get("price")
    message_text = decision.get("message_text", "")
    reason = decision.get("reason", "")
    intent = decision.get("intent", "")

    # === CONTENT PICKER: auto-resolve content if Opus didn't specify ===
    if action in ("ppv", "free") and not content_key:
        try:
            sys.path.insert(0, DIR)
            from importlib import import_module
            picker = import_module("bianca-content-picker")
            
            # Load fan state for picker
            all_fan_state = load_json(FAN_STATE_FILE, {})
            fan_state = all_fan_state.get(str(fan_id), {})
            
            # Map action to intent
            pick_intent = intent if intent else ("free" if action == "free" else "ppv")
            picked = picker.pick_content(fan_state, pick_intent)
            
            if picked:
                content_key = picked["content_key"]
                if not price and picked.get("price"):
                    price = picked["price"]
                decision["content_key"] = content_key
                decision["price"] = price
                decision["_picked"] = picked  # for logging
                
                # Update sexting chain state if applicable
                if picked.get("_chain_update") and picked["_chain_update"].get("sexting_step") is not None:
                    fan_state["sexting_chain"] = picked["_chain_update"]["sexting_chain"]
                    fan_state["sexting_step"] = picked["_chain_update"]["sexting_step"]
                    all_fan_state[str(fan_id)] = fan_state
                    save_json(FAN_STATE_FILE, all_fan_state)
        except Exception as e:
            # Picker failed — log but don't block
            result["picker_error"] = str(e)

    result = {"fan_id": fan_id, "action": action}

    if action == "skip":
        result["reason"] = reason
        print(json.dumps(result))
        return

    # Validate content_key if needed
    if action in ("ppv", "free_media"):
        if content_key not in VAULT_MAP:
            # Try fuzzy match (e.g. "bundle1_zebra_bra" → "bundle1")
            matched = None
            for key in VAULT_MAP:
                if content_key.startswith(key) or key.startswith(content_key):
                    matched = key
                    break
            if not matched:
                result["error"] = f"invalid content_key: {content_key}"
                result["valid_keys"] = list(VAULT_MAP.keys())[:10]
                print(json.dumps(result))
                return
            content_key = matched

        vault_ids = VAULT_MAP[content_key]

        # For free hooks with multiple items, pick 1-3 random
        if action == "free_media":
            if len(vault_ids) > 3:
                vault_ids = pick_random(vault_ids, 2)
        
        # Build API body
        body = {"text": message_text, "mediaFiles": vault_ids}
        if action == "ppv" and price:
            body["price"] = price

        # Check Redis for dedup (don't send same content twice)
        sent = curl_json(f"{RAILWAY}/fans/{ACCOUNT_ID}/{fan_id}/sent")
        if isinstance(sent, list) and content_key in sent:
            result["warning"] = f"already_sent:{content_key}"
            # Still send but note it

        # Send via OF API
        resp = curl_json(f"{OF_API}/chats/{fan_id}/messages",
                         headers={"Authorization": OF_KEY},
                         method="POST", body=body)

        if isinstance(resp, dict) and resp.get("error") == "429":
            # 429 — trigger rate limit protection
            opus = load_json(OPUS_CALLS_FILE, {"calls": [], "last_429": None})
            opus["last_429"] = now_ms()
            save_json(OPUS_CALLS_FILE, opus)
            
            state = load_json(SYSTEM_STATE_FILE, {})
            state["SYSTEM_ENABLED"] = False
            state["disabled_reason"] = "429 on send"
            state["disabled_at"] = now_ms()
            save_json(SYSTEM_STATE_FILE, state)
            
            result["error"] = "429_rate_limit"
            result["system_disabled"] = True
            print(json.dumps(result))
            return

        result["api_response"] = resp
        result["content_key"] = content_key
        result["vault_ids_count"] = len(vault_ids)

        # Log to Redis
        if action == "ppv":
            curl_json(f"{RAILWAY}/fans/{ACCOUNT_ID}/{fan_id}/sent",
                      method="POST",
                      body={"content_key": content_key, "price": price, "ts": now_ms()},
                      headers={"Content-Type": "application/json"})

    elif action == "text":
        body = {"text": message_text}
        resp = curl_json(f"{OF_API}/chats/{fan_id}/messages",
                         headers={"Authorization": OF_KEY},
                         method="POST", body=body)
        
        if isinstance(resp, dict) and resp.get("error") == "429":
            opus = load_json(OPUS_CALLS_FILE, {"calls": [], "last_429": None})
            opus["last_429"] = now_ms()
            save_json(OPUS_CALLS_FILE, opus)
            state = load_json(SYSTEM_STATE_FILE, {})
            state["SYSTEM_ENABLED"] = False
            save_json(SYSTEM_STATE_FILE, state)
            result["error"] = "429_rate_limit"
            print(json.dumps(result))
            return

        result["api_response"] = resp
    else:
        result["error"] = f"unknown action: {action}"

    # Auto-add fan to bump exclude list (silent fail for non-subs)
    EXCLUDE_LIST_ID = 1265115686
    curl_json(f"{OF_API}/user-lists/{EXCLUDE_LIST_ID}/users",
              headers={"Authorization": OF_KEY},
              method="POST", body={"ids": [fan_id]}, timeout=5)

    # Update fan state
    all_state = load_json(FAN_STATE_FILE, {})
    fan_key = str(fan_id)
    if fan_key not in all_state:
        all_state[fan_key] = {}
    
    fs = all_state[fan_key]
    fs["lastProcessedAt"] = datetime.now(timezone.utc).isoformat()
    fs["lastAction"] = f"{fs['lastProcessedAt']} - Sent {action}: {content_key or message_text[:50]}"
    if action in ("ppv", "free_media") and content_key:
        if "content_sent" not in fs:
            fs["content_sent"] = []
        if content_key not in fs["content_sent"]:
            fs["content_sent"].append(content_key)
        fs["messages_sent"] = fs.get("messages_sent", 0) + 1
    if action == "ppv" and price:
        if "priceHistory" not in fs:
            fs["priceHistory"] = []
        fs["priceHistory"].append(price)
        fs["last_ppv_price"] = price
        fs["totalSpent"] = fs.get("totalSpent", 0)  # Don't add — this tracks what FAN spent
    
    save_json(FAN_STATE_FILE, all_state)

    # Update fan memory last_seen_message_id
    memory = load_json(FAN_MEMORY_FILE, {"fans": {}})
    if "fans" not in memory:
        memory["fans"] = {}
    if fan_key not in memory["fans"]:
        memory["fans"][fan_key] = {}
    # We mark as processed now
    memory["fans"][fan_key]["last_processed_at"] = now_ms()
    save_json(FAN_MEMORY_FILE, memory)

    # Record metrics
    metrics = load_json(METRICS_FILE, {})
    if "spawns" not in metrics:
        metrics["spawns"] = []
    metrics["spawns"].append({
        "fan_id": fan_id,
        "action": action,
        "content_key": content_key,
        "price": price,
        "ts": now_ms()
    })
    metrics["spawns"] = metrics["spawns"][-100:]
    save_json(METRICS_FILE, metrics)

    # Clear from pending
    curl_json(f"{RAILWAY}/webhooks/pending/{ACCOUNT_ID}/clear",
              method="POST",
              body={"fanIds": [fan_id]},
              headers={"Content-Type": "application/json"})

    print(json.dumps(result))


if __name__ == "__main__":
    main()
