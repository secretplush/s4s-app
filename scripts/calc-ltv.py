import json, subprocess

API = "https://app.onlyfansapi.com/api"
KEY = "ofapi_bT4J1Er2YBow46EihDfjlSFf5HRmiM15M4DCOoHn7889d8b4"

def fetch(url):
    result = subprocess.run(["curl", "-s", url, "-H", f"Authorization: Bearer {KEY}"], capture_output=True, text=True)
    return json.loads(result.stdout)

accounts = fetch(f"{API}/accounts")
print(f"Scanning {len(accounts)} accounts...")

results = []
for a in accounts:
    acct_id = a["id"]
    username = a.get("onlyfans_username", "?")
    try:
        earnings = fetch(f"{API}/{acct_id}/statistics/statements/earnings?start_date=2022-01-01&end_date=2026-02-16&type=total")
        total = earnings.get("data", {}).get("total", {}).get("total", 0) or 0
        
        fans_data = a.get("onlyfans_user_data", {})
        fan_count = fans_data.get("subscribersCount", 0) or 0
        
        ltv = total / fan_count if fan_count > 0 else 0
        results.append({"username": username, "total": round(total, 2), "fans": fan_count, "ltv": round(ltv, 2), "acct": acct_id})
    except Exception as e:
        print(f"  {username}: ERROR - {e}")
        results.append({"username": username, "total": 0, "fans": 0, "ltv": 0, "acct": acct_id})

results.sort(key=lambda x: x["ltv"])

print("\n=== LOWEST LTV (50+ fans) ===")
count = 0
for r in results:
    if r["fans"] > 50 and count < 10:
        print(f"  {r['username']}: ${r['ltv']:.2f} LTV (${r['total']:,.0f} / {r['fans']:,} fans)")
        count += 1

print("\n=== HIGHEST LTV (50+ fans) ===")
count = 0
for r in sorted(results, key=lambda x: -x["ltv"]):
    if r["fans"] > 50 and count < 10:
        print(f"  {r['username']}: ${r['ltv']:.2f} LTV (${r['total']:,.0f} / {r['fans']:,} fans)")
        count += 1

with open("/Users/moltplush/.openclaw/workspace/research/all-model-ltv.json", "w") as f:
    json.dump(sorted(results, key=lambda x: x["ltv"]), f, indent=2)
print("\nSaved to research/all-model-ltv.json")
