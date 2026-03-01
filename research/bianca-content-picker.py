#!/usr/bin/env python3
"""
Bianca content picker — deterministic content selection based on fan state.
Opus says WHAT to do, this picks the exact content + price.

Usage:
    from bianca_content_picker import pick_content
    result = pick_content(fan_state, opus_intent)
    # result = {"content_key": "bundle11", "vault_ids": [...], "price": 18, "description": "implied nude tit bounce"}
"""

import json, os, random

CONTENT_MAP_PATH = os.path.join(os.path.dirname(__file__), "biancawoods-content-map.json")

with open(CONTENT_MAP_PATH) as f:
    VAULT = json.load(f)

# === CONTENT TIERS (ordered by explicitness) ===

# Tier 1: Entry-level bundles ($15-18) — bikini, bra, strip tease
ENTRY_BUNDLES = [
    {"key": f"bundle{i}", "id": b["id"], "name": b["name"], "desc": b["description"], "price": 15}
    for i, b in enumerate(VAULT["bundles"][:10], 1)
]

# Tier 2: Implied nude bundles ($18) — hand bra, tit bounce, strips
IMPLIED_BUNDLES = [
    {"key": f"bundle{i}", "id": b["id"], "name": b["name"], "desc": b["description"], "price": 18}
    for i, b in enumerate(VAULT["bundles"][10:], 11)
]

# Tier 3: Sexting chains — progressive video strips ($15-$100)
SEXTING_CHAINS = {}
for chain_name, chain in VAULT["sextingChains"].items():
    SEXTING_CHAINS[chain_name] = []
    for step in chain["steps"]:
        SEXTING_CHAINS[chain_name].append({
            "key": f"{chain_name}_step{step['step']}",
            "id": step["categoryId"],
            "name": step["name"],
            "type": step["type"],
            "price": step["price"],
            "content_type": step["contentType"]
        })

# Tier 4: Custom upsells ($50+) — the real money
CUSTOM_UPSELLS = [
    {"key": "upsell_shower", "id": 26023968, "ss_id": 26346740, "name": "Shower - soapy boobs", "price": 50},
    {"key": "upsell_bedroom_boobs", "id": 26058756, "ss_id": 26346738, "name": "Bedroom Boobs", "price": 55},
    {"key": "upsell_bedroom_topless", "id": 26110169, "ss_id": 26346737, "name": "Bedroom Topless", "price": 60},
    {"key": "upsell_topless_rubbing", "id": 26249395, "ss_id": 26346736, "name": "Topless + Rubbing", "price": 70},
    {"key": "upsell_titty_fuck", "id": 26278094, "ss_id": 26346735, "name": "Titty Fuck", "price": 80},
    {"key": "upsell_try_on", "id": 26288698, "ss_id": 26346725, "name": "Try On Lingerie", "price": 50},
    {"key": "upsell_cumming", "id": 26330563, "ss_id": 26346734, "name": "Topless + Rubbing + Cumming", "price": 100},
]

# Body categories for specific requests
BODY_CATS = {
    "booty": {"id": 25942153, "price": 25},
    "feet": {"id": 25942149, "price": 25},
    "implied": {"id": 25942152, "price": 25},
    "lingerie": {"id": 25942151, "price": 25},
    "boobs": {"id": 25942155, "price": 50, "vip_only": True},
    "nude": {"id": 25942164, "price": 75, "vip_only": True},
    "pussy": {"id": 25942162, "price": 100, "vip_only": True},
}

# Free content for hooks
FREE_CONTENT = {
    "selfie": {"id": 26201789, "name": "GFE Selfie"},
    "preview": {"id": 26358364, "name": "Preview Bump"},
    "rekindle": {"id": 26359465, "name": "Rekindle Vid/VM"},
    "promo": {"id": 26347872, "name": "Promo Bump"},
    "cb_selfie": {"id": 26373605, "name": "CB Promo Selfie"},
}


def _get_sent(fan_state):
    """Get set of content keys already sent to this fan."""
    return set(fan_state.get("content_sent", []))


def _pick_unseen(options, sent):
    """Pick random unseen content from options list. Falls back to random if all seen."""
    unseen = [o for o in options if o["key"] not in sent]
    if unseen:
        return random.choice(unseen)
    # All seen — pick random anyway (repeat is fine)
    return random.choice(options) if options else None


def pick_content(fan_state, opus_intent="ppv"):
    """
    Pick content based on fan state. Returns dict with content details.
    
    opus_intent: "ppv" | "free" | "upsell" | "sexting" | "body_booty" | "body_feet" | etc.
    
    Fan state fields used:
        totalSpent (float), purchaseCount (int), content_sent (list of keys),
        sexting_chain (str|None), sexting_step (int)
    """
    spent = fan_state.get("totalSpent", 0)
    purchases = fan_state.get("purchaseCount", 0)
    sent = _get_sent(fan_state)
    
    # === HANDLE SPECIFIC BODY REQUESTS ===
    if opus_intent.startswith("body_"):
        body_type = opus_intent.replace("body_", "")
        if body_type in BODY_CATS:
            cat = BODY_CATS[body_type]
            # Block VIP-only content for low spenders
            if cat.get("vip_only") and spent < 50:
                # Downgrade to implied/lingerie
                cat = BODY_CATS["implied"]
                body_type = "implied"
            return {
                "content_key": f"body_{body_type}",
                "category_id": cat["id"],
                "price": cat["price"],
                "description": body_type,
                "tier": "body"
            }
    
    # === FREE HOOK ===
    if opus_intent == "free":
        free = random.choice(list(FREE_CONTENT.values()))
        return {
            "content_key": f"free_{free['name'].lower().replace(' ', '_')}",
            "category_id": free["id"],
            "price": 0,
            "description": free["name"],
            "tier": "free"
        }
    
    # === SEXTING CHAIN (if fan is mid-chain) ===
    if opus_intent == "sexting" or fan_state.get("sexting_chain"):
        chain_name = fan_state.get("sexting_chain")
        step = fan_state.get("sexting_step", 0)
        
        if not chain_name:
            # Start a new chain — pick one they haven't done
            used_chains = fan_state.get("chains_used", [])
            available = [c for c in ["sexting1", "sexting2", "sexting3"] if c not in used_chains]
            if not available:
                available = ["sexting1", "sexting2", "sexting3"]
            chain_name = random.choice(available)
            step = 0
        
        chain = SEXTING_CHAINS.get(chain_name, [])
        if step < len(chain):
            item = chain[step]
            return {
                "content_key": item["key"],
                "category_id": item["id"],
                "price": item["price"],
                "description": item["name"],
                "tier": "sexting",
                "chain": chain_name,
                "step": step,
                "next_step": step + 1 if step + 1 < len(chain) else None
            }
    
    # === CUSTOM UPSELL (high spenders) ===
    if opus_intent == "upsell" or (opus_intent == "ppv" and spent >= 75):
        item = _pick_unseen(CUSTOM_UPSELLS, sent)
        if item:
            return {
                "content_key": item["key"],
                "category_id": item["id"],
                "screenshot_id": item.get("ss_id"),
                "price": item["price"],
                "description": item["name"],
                "tier": "custom_upsell"
            }
    
    # === STANDARD PPV SELECTION ===
    # $0 spent, 0 purchases → entry implied nude bundle at $15
    if purchases == 0:
        item = _pick_unseen(IMPLIED_BUNDLES, sent)
        if not item:
            item = _pick_unseen(ENTRY_BUNDLES, sent)
        if item:
            return {
                "content_key": item["key"],
                "category_id": item["id"],
                "price": 15,  # First PPV always $15 to reduce friction
                "description": item["desc"],
                "tier": "bundle"
            }
    
    # 1-2 purchases → implied bundles at $18, or start sexting chain
    if purchases <= 2:
        # 50% chance start a sexting chain, 50% another bundle
        if random.random() < 0.5:
            return pick_content(fan_state, "sexting")
        item = _pick_unseen(IMPLIED_BUNDLES, sent)
        if not item:
            item = _pick_unseen(ENTRY_BUNDLES, sent)
        if item:
            price = 18 if purchases == 1 else 25
            return {
                "content_key": item["key"],
                "category_id": item["id"],
                "price": price,
                "description": item["desc"],
                "tier": "bundle"
            }
    
    # 3-4 purchases → mix of bundles at $25-38 and sexting progression
    if purchases <= 4:
        if random.random() < 0.6:
            return pick_content(fan_state, "sexting")
        item = _pick_unseen(IMPLIED_BUNDLES + ENTRY_BUNDLES, sent)
        if item:
            price = 25 if purchases == 3 else 38
            return {
                "content_key": item["key"],
                "category_id": item["id"],
                "price": price,
                "description": item["desc"],
                "tier": "bundle"
            }
    
    # 5+ purchases → upsell territory
    return pick_content(fan_state, "upsell")


def pick_for_opus_decision(fan_state, opus_decision):
    """
    Takes raw Opus JSON decision and resolves content.
    
    Opus output format:
        {"action": "ppv", "intent": "sell", "message_text": "..."}
        {"action": "ppv", "intent": "body_booty", "message_text": "..."}
        {"action": "ppv", "intent": "upsell", "message_text": "..."}
        {"action": "text", "message_text": "..."}
        {"action": "free", "message_text": "..."}
    
    Returns enriched decision with content details filled in.
    """
    action = opus_decision.get("action", "text")
    
    if action == "text":
        return opus_decision  # No content needed
    
    intent = opus_decision.get("intent", "ppv")
    
    if action == "free":
        intent = "free"
    
    content = pick_content(fan_state, intent)
    
    if content:
        opus_decision["content_key"] = content["content_key"]
        opus_decision["category_id"] = content["category_id"]
        opus_decision["price"] = content["price"]
        opus_decision["content_description"] = content["description"]
        opus_decision["tier"] = content["tier"]
        if "screenshot_id" in content:
            opus_decision["screenshot_id"] = content["screenshot_id"]
        if "chain" in content:
            opus_decision["_chain_update"] = {
                "sexting_chain": content["chain"],
                "sexting_step": content.get("next_step"),
            }
    
    return opus_decision


# === CLI TEST ===
if __name__ == "__main__":
    import sys
    
    # Test with different fan states
    tests = [
        ("$0 new fan", {"totalSpent": 0, "purchaseCount": 0, "content_sent": []}, "ppv"),
        ("$15 one purchase", {"totalSpent": 15, "purchaseCount": 1, "content_sent": ["bundle11"]}, "ppv"),
        ("$50 three purchases", {"totalSpent": 50, "purchaseCount": 3, "content_sent": ["bundle11", "bundle12", "sexting1_step1"]}, "ppv"),
        ("$100 whale", {"totalSpent": 100, "purchaseCount": 5, "content_sent": []}, "ppv"),
        ("booty request", {"totalSpent": 25, "purchaseCount": 1, "content_sent": []}, "body_booty"),
        ("free hook", {"totalSpent": 0, "purchaseCount": 0, "content_sent": []}, "free"),
        ("low spender wants boobs", {"totalSpent": 15, "purchaseCount": 1, "content_sent": []}, "body_boobs"),
    ]
    
    for name, state, intent in tests:
        result = pick_content(state, intent)
        print(f"\n{name} (intent={intent}):")
        print(f"  → {result['content_key']} @ ${result['price']} — {result['description']} [{result['tier']}]")
