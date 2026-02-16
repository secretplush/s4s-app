import json, urllib.request

ACCT = "acct_ebca85077e0a4b7da04cf14176466411"
API = "https://app.onlyfansapi.com/api"
KEY = "ofapi_bT4J1Er2YBow46EihDfjlSFf5HRmiM15M4DCOoHn7889d8b4"

import subprocess
def fetch(url):
    result = subprocess.run(["curl", "-s", url, "-H", f"Authorization: Bearer {KEY}"], capture_output=True, text=True)
    return json.loads(result.stdout)

# Get all vault items
all_items = []
offset = 0
while True:
    d = fetch(f"{API}/{ACCT}/media/vault?limit=100&offset={offset}")
    items = d.get("data", {}).get("list", [])
    all_items.extend(items)
    if len(items) < 100:
        break
    offset += 100

print(f"Total vault items: {len(all_items)}")

# Categorize
by_category = {}
for item in all_items:
    cats = [s["name"] for s in item.get("listStates", []) if s.get("hasMedia")]
    for c in cats:
        if c not in by_category:
            by_category[c] = []
        by_category[c].append({
            "id": item["id"],
            "type": item.get("type", "?"),
            "created": item.get("createdAt", "")[:10],
        })

print("\nCategories:")
for cat, items in sorted(by_category.items(), key=lambda x: -len(x[1])):
    types = {}
    for i in items:
        types[i["type"]] = types.get(i["type"], 0) + 1
    type_str = ", ".join(f"{v} {k}s" for k, v in types.items())
    print(f"  {cat}: {len(items)} items ({type_str})")

# Save message-eligible content for chatbot
message_items = []
for item in all_items:
    cats = [s["name"] for s in item.get("listStates", []) if s.get("hasMedia")]
    # Items used in Messages or custom bundles
    if any("Message" in c or "Bundle" in c or "VIP" in c for c in cats):
        message_items.append({
            "id": item["id"],
            "type": item.get("type", "photo"),
            "categories": cats,
            "created": item.get("createdAt", "")[:10],
        })

print(f"\nMessage-eligible items (for PPV): {len(message_items)}")
for i in message_items[:10]:
    print(f"  {i['id']} | {i['type']} | {i['categories']}")

# Save to file
with open("/Users/moltplush/.openclaw/workspace/research/millie-vault-catalog.json", "w") as f:
    json.dump({"total": len(all_items), "message_items": message_items, "categories": {k: len(v) for k, v in by_category.items()}}, f, indent=2)
print("\nSaved to research/millie-vault-catalog.json")
