#!/usr/bin/env python3
import json, subprocess, os, sys
from concurrent.futures import ThreadPoolExecutor, as_completed

BASE = "https://app.onlyfansapi.com/api"
AUTH = "Bearer ofapi_bT4J1Er2YBow46EihDfjlSFf5HRmiM15M4DCOoHn7889d8b4"
RESULTS_FILE = "/Users/moltplush/.openclaw/workspace/research/crosscheck_raw.jsonl"

FANS = [295453773,43172416,481908886,27764995,381722302,510689604,501131692,211167711,78758818,551946850,58225378,162040450,38538828,342825595,215896770,88782966,13773454,519252757,501611381,399320879,38344265,468724126,492892553,521251527,487661304,41935537,101145574,493284700,348044080,510229776,518394357,320188597,350190041,90144751,503122165,125176575,543223439,422303354,33047249,464862037,167878750,246990490,40938503,520047228,20351417,489700117,79975722,496210323,341301914,128404913,194494614,33350368,299370976,491929739,23740432,474227897,8363718,7592885,228155638,293592778,298389627,475383958,141738457,178706071,168076472,474329820,105439877,61041170,46125423,442138515,49453574]

def curl_get(url):
    r = subprocess.run(["curl", "-s", "-H", f"Authorization: {AUTH}", url], capture_output=True, text=True, timeout=30)
    return json.loads(r.stdout) if r.stdout else None

def check_fan(acct_id, model, fan_id):
    try:
        d = curl_get(f"{BASE}/{acct_id}/users/{fan_id}")
        if not d: return None
        u = d.get("data", d)
        if u.get("subscribedBy"):
            so = u.get("subscribedOnData") or {}
            return {
                "fan_id": fan_id, "account_id": acct_id, "model": model,
                "name": u.get("name",""), "username": u.get("username",""),
                "totalSumm": so.get("totalSumm",0), "tipsSumm": so.get("tipsSumm",0),
                "messagesSumm": so.get("messagesSumm",0), "postsSumm": so.get("postsSumm",0),
                "subscribesSumm": so.get("subscribesSumm",0),
            }
    except:
        pass
    return None

# Load existing results to know which accounts are done
existing = []
done_accounts = set()
if os.path.exists(RESULTS_FILE):
    with open(RESULTS_FILE) as f:
        for line in f:
            line = line.strip()
            if line:
                try:
                    existing.append(json.loads(line))
                except:
                    pass
    # Consider an account done if we see it in results (imperfect but close enough)
    # Actually let's track done accounts separately
    
# Get accounts
accounts_data = curl_get(f"{BASE}/accounts")
accounts = [(a["id"], a["display_name"]) for a in accounts_data if a.get("is_authenticated")]
print(f"Found {len(accounts)} accounts, {len(FANS)} fans")

# Load done accounts
DONE_FILE = "/Users/moltplush/.openclaw/workspace/research/crosscheck_done.txt"
if os.path.exists(DONE_FILE):
    with open(DONE_FILE) as f:
        done_accounts = set(f.read().split())

results_f = open(RESULTS_FILE, "a")

for i, (acct_id, model) in enumerate(accounts):
    if acct_id in done_accounts:
        print(f"[{i+1}/{len(accounts)}] SKIP {model}")
        continue
    
    print(f"[{i+1}/{len(accounts)}] {model}...", end=" ", flush=True)
    found = 0
    spent = 0
    
    with ThreadPoolExecutor(max_workers=15) as ex:
        futures = {ex.submit(check_fan, acct_id, model, fid): fid for fid in FANS}
        for fut in as_completed(futures):
            result = fut.result()
            if result:
                results_f.write(json.dumps(result) + "\n")
                results_f.flush()
                found += 1
                if result["totalSumm"] > 0:
                    spent += 1
    
    done_accounts.add(acct_id)
    with open(DONE_FILE, "a") as df:
        df.write(acct_id + "\n")
    
    print(f"{found} fans, {spent} spenders")

results_f.close()
print("\n=== DONE ===")
