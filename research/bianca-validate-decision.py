#!/usr/bin/env python3
"""
bianca-validate-decision.py — Validates Opus worker JSON decisions.

Usage: python3 research/bianca-validate-decision.py '<json_decision>'

Validates:
1. content_key exists in catalog
2. If invalid, replaces with fallback based on price tier
3. Logs hallucinated keys

Outputs: validated JSON decision (or original if no changes needed)
"""

import sys
import json
import os
from datetime import datetime

VALID_KEYS = {
    # Free hooks
    "booty_pic", "bump_1", "bump_2", "bump_3", "bump_4", "bump_5", "bump_6",
    "cb_promo_1", "cb_promo_2", "cb_promo_3",
    "feet_pics",
    "gfe_selfie_1", "gfe_selfie_2", "gfe_selfie_3", "gfe_selfie_4", "gfe_selfie_5",
    "gfe_selfie_6", "gfe_selfie_7", "gfe_selfie_8", "gfe_selfie_9", "gfe_selfie_10", "gfe_selfie_11",
    "preview_bump_1", "preview_bump_2", "preview_bump_3", "preview_bump_4",
    "rekindle_vid_1", "rekindle_vid_2", "rekindle_vm",
    "sexting1_pic_free", "sexting2_pic_free", "sexting3_pic_free",
    # Bundles ($18)
    "bundle1_zebra_bra", "bundle2_strip_tease", "bundle3_handbra", "bundle4_leopard_kini",
    "bundle5_blue_kini", "bundle6_no_undie", "bundle7_brown_lingerie", "bundle8_nude_bra",
    "bundle9_bed", "bundle10_bts_shower", "bundle11_red_bra", "bundle12_sheer_black",
    "bundle13_white_dress", "bundle14_dress_striptease", "bundle15_corset_striptease",
    "bundle16_jacket_striptease", "bundle17_black_striptease", "bundle18_flower_striptease",
    "bundle19_black_lingerie", "bundle20_beige_bra", "bundle21_pink_floral", "bundle22_black_tease",
    "bundle23_cherry_top", "bundle24_black_floral", "bundle25_black_ribbon", "bundle26_white_shirt",
    # Sexting chains
    "sexting1_vid_15", "sexting1_vid_24", "sexting1_vid_38", "sexting1_vid_54", "sexting1_vid_75",
    "sexting2_vid_15", "sexting2_vid_24", "sexting2_vid_38", "sexting2_vid_54", "sexting2_vid_75",
    "sexting3_vid_15", "sexting3_vid_24", "sexting3_vid_38", "sexting3_vid_54", "sexting3_vid_75", "sexting3_vid_100",
    # Custom tiers
    "custom_tier1_shower", "custom_tier2_bedroom_boobs", "custom_tier3_bedroom_topless",
    "custom_tier4_topless_rubbing", "custom_tier5_titty_fuck", "custom_tier6_try_on", "custom_tier7_cumming_top",
}

# Fallbacks by price range
FALLBACKS = {
    "free": "gfe_selfie_1",
    "low": "bundle1_zebra_bra",       # $18
    "mid_15": "sexting1_vid_15",       # $15
    "mid_24": "sexting1_vid_24",       # $24
    "mid_38": "sexting1_vid_38",       # $38
    "high_54": "sexting1_vid_54",      # $54
    "high_75": "sexting1_vid_75",      # $75
    "premium": "custom_tier1_shower",  # $50
}

def get_fallback(price):
    if not price or price == 0:
        return FALLBACKS["free"]
    if price <= 18:
        return FALLBACKS["low"]
    if price <= 20:
        return FALLBACKS["mid_15"]
    if price <= 30:
        return FALLBACKS["mid_24"]
    if price <= 45:
        return FALLBACKS["mid_38"]
    if price <= 60:
        return FALLBACKS["high_54"]
    if price <= 80:
        return FALLBACKS["high_75"]
    return FALLBACKS["premium"]

def log_hallucination(bad_key, fallback_key, price):
    log_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "bianca-hallucinated-keys.log")
    with open(log_path, "a") as f:
        f.write(f"{datetime.utcnow().isoformat()} | hallucinated={bad_key} | fallback={fallback_key} | price={price}\n")

def main():
    decision = json.loads(sys.argv[1])
    action = decision.get("action", "skip")
    
    if action in ("ppv", "free_media"):
        content_key = decision.get("content_key", "")
        if content_key not in VALID_KEYS:
            price = decision.get("price", 0)
            fallback = get_fallback(price)
            log_hallucination(content_key, fallback, price)
            decision["content_key"] = fallback
            decision["_fallback_used"] = True
            decision["_original_key"] = content_key
    
    print(json.dumps(decision))

if __name__ == "__main__":
    main()
