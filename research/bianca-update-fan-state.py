#!/usr/bin/env python3
"""
bianca-update-fan-state.py — Updates fan state after a dispatch cycle.

Usage: python3 research/bianca-update-fan-state.py <fanId> '<json_update>'

JSON update fields (all optional):
{
    "action_taken": "text|ppv|free_media|skip",
    "content_key": "bundle1_zebra_bra",
    "price": 18,
    "bump_message_id": "12345",
    "conversation_stage": "warming|escalating|selling|aftercare|dormant",
    "current_goal": "convert_first_purchase|upsell|retain_whale|reactivate",
    "notes_append": "extra note text"
}

Updates:
- spend_total (if PPV opened — tracked separately)
- last_offer_time (if PPV sent)
- offers_sent_without_purchase (incremented on PPV, reset on purchase)
- conversation_stage
- current_goal
- last_bump_message_id (for bump unsend tracking)
- bump_count_this_cycle (for max 3 bumps)
- lastProcessedAt
"""

import sys
import json
import os
from datetime import datetime, timezone

STATE_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "bianca-fan-state.json")

def main():
    fan_id = sys.argv[1]
    update = json.loads(sys.argv[2])
    
    with open(STATE_PATH, "r") as f:
        state = json.load(f)
    
    fan = state.get(fan_id, {})
    now = datetime.now(timezone.utc).isoformat()
    
    # Always update timestamp
    fan["lastProcessedAt"] = now
    
    action = update.get("action_taken", "text")
    
    # Sales state tracking
    if action == "ppv":
        fan["last_offer_time"] = now
        fan["offers_sent_without_purchase"] = fan.get("offers_sent_without_purchase", 0) + 1
        # Track what was offered
        if "ppv_history" not in fan:
            fan["ppv_history"] = []
        fan["ppv_history"].append({
            "content_key": update.get("content_key"),
            "price": update.get("price"),
            "time": now,
            "opened": False
        })
    
    # Bump tracking
    if update.get("bump_message_id"):
        fan["last_bump_message_id"] = update["bump_message_id"]
        fan["bump_count_this_cycle"] = fan.get("bump_count_this_cycle", 0) + 1
    
    # Stage and goal updates
    if update.get("conversation_stage"):
        fan["conversation_stage"] = update["conversation_stage"]
    if update.get("current_goal"):
        fan["current_goal"] = update["current_goal"]
    
    # Append notes
    if update.get("notes_append"):
        existing = fan.get("notes", "")
        fan["notes"] = existing + " " + update["notes_append"] if existing else update["notes_append"]
    
    # Spend tracking (set externally when purchase confirmed)
    if "spend_total" not in fan:
        fan["spend_total"] = fan.get("totalSpent", 0)
    
    state[fan_id] = fan
    
    with open(STATE_PATH, "w") as f:
        json.dump(state, f, indent=2)
    
    print(f"UPDATED: fan={fan_id} action={action} stage={fan.get('conversation_stage', 'unknown')} goal={fan.get('current_goal', 'unknown')} offers_no_purchase={fan.get('offers_sent_without_purchase', 0)}")

if __name__ == "__main__":
    main()
