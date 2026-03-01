#!/usr/bin/env python3
import json, subprocess, os, sys, time

BASE = "https://app.onlyfansapi.com/api"
AUTH = "Bearer ofapi_bT4J1Er2YBow46EihDfjlSFf5HRmiM15M4DCOoHn7889d8b4"
RESULTS_FILE = "/Users/moltplush/.openclaw/workspace/research/crosscheck_raw.jsonl"
DONE_FILE = "/Users/moltplush/.openclaw/workspace/research/crosscheck_done.txt"

FANS = [295453773,43172416,481908886,27764995,381722302,510689604,501131692,211167711,78758818,551946850,58225378,162040450,38538828,342825595,215896770,88782966,13773454,519252757,501611381,399320879,38344265,468724126,492892553,521251527,487661304,41935537,101145574,493284700,348044080,510229776,518394357,320188597,350190041,90144751,503122165,125176575,543223439,422303354,33047249,464862037,167878750,246990490,40938503,520047228,20351417,489700117,79975722,496210323,341301914,128404913,194494614,33350368,299370976,491929739,23740432,474227897,8363718,7592885,228155638,293592778,298389627,475383958,141738457,178706071,168076472,474329820,105439877,61041170,46125423,442138515,49453574]

def curl_get(url):
    r = subprocess.run(["curl", "-s", "-H", f"Authorization: {AUTH}", url], capture_output=True, text=True, timeout=30)
    return json.loads(r.stdout) if r.stdout.strip() else None

# Get accounts
accounts_data = curl_get(f"{BASE}/accounts")
accounts = [(a["id"], a["display_name"]) for a in accounts_data if a.get("is_authenticated")]
print(f"Found {len(accounts)} accounts, {len(FANS)} fans", flush=True)

# Load done
done = set()
if os.path.exists(DONE_FILE):
    with open(DONE_FILE) as f:
        done = set(l.strip() for l in f if l.strip())

for i, (acct_id, model) in enumerate(accounts):
    if acct_id in done:
        print(f"[{i+1}/{len(accounts)}] SKIP {model}", flush=True)
        continue
    
    sys.stdout.write(f"[{i+1}/{len(accounts)}] {model}: ")
    sys.stdout.flush()
    found = 0
    spent = 0
    
    # Use curl multi to fetch all 71 fans at once
    # Write a curl config file for parallel fetching
    cfg = "/tmp/curl_batch.txt"
    with open(cfg, "w") as f:
        for fan_id in FANS:
            f.write(f'url = "{BASE}/{acct_id}/users/{fan_id}"\n')
            f.write(f'-H "Authorization: {AUTH}"\n')
            f.write(f'-o "/tmp/fan_{fan_id}.json"\n')
            f.write(f'--next\n')
    
    # Run with parallel connections
    subprocess.run(["curl", "--parallel", "--parallel-max", "20", "-s", "-K", cfg], 
                   capture_output=True, timeout=120)
    
    with open(RESULTS_FILE, "a") as rf:
        for fan_id in FANS:
            fpath = f"/tmp/fan_{fan_id}.json"
            try:
                with open(fpath) as f:
                    d = json.load(f)
                u = d.get("data", d)
                if u.get("subscribedBy"):
                    so = u.get("subscribedOnData") or {}
                    entry = {
                        "fan_id": fan_id, "account_id": acct_id, "model": model,
                        "name": u.get("name",""), "username": u.get("username",""),
                        "totalSumm": so.get("totalSumm",0), "tipsSumm": so.get("tipsSumm",0),
                        "messagesSumm": so.get("messagesSumm",0), "postsSumm": so.get("postsSumm",0),
                        "subscribesSumm": so.get("subscribesSumm",0),
                    }
                    rf.write(json.dumps(entry) + "\n")
                    found += 1
                    if entry["totalSumm"] > 0:
                        spent += 1
            except:
                pass
            finally:
                try: os.remove(fpath)
                except: pass
    
    with open(DONE_FILE, "a") as df:
        df.write(acct_id + "\n")
    done.add(acct_id)
    
    print(f"{found} fans, {spent} spenders", flush=True)

print("\n=== DONE ===", flush=True)
