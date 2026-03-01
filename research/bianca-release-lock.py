#!/usr/bin/env python3
"""Release global_opus_lock after worker completes."""
import json, sys

LOCKS_FILE = "research/bianca-locks.json"

try:
    with open(LOCKS_FILE) as f:
        locks = json.load(f)
except:
    sys.exit(0)

locks["global_opus_lock"] = None

# Also clear dispatcher lock if stale
locks["dispatcher_lock"] = None

with open(LOCKS_FILE, "w") as f:
    json.dump(locks, f, indent=2)

print("LOCK_RELEASED")
