#!/usr/bin/env python3
"""
Bianca Webhook Queue — RECEIVE ONLY, NO SENDING.
Catches OF webhooks, queues fan messages for Opus processing.
Does NOT send any messages to fans. Ever.
"""

import json, os, time, logging, threading
from http.server import HTTPServer, BaseHTTPRequestHandler
from datetime import datetime, timezone

DIR = os.path.dirname(os.path.abspath(__file__))
QUEUE_FILE = os.path.join(DIR, "bianca-message-queue.json")
SYSTEM_STATE_FILE = os.path.join(DIR, "bianca-system-state.json")
LOG_FILE = os.path.join(DIR, "bianca-webhook-queue.log")
ACCOUNT_ID = "acct_54e3119e77da4429b6537f7dd2883a05"
BIANCA_USER_ID = 525755724

# Fans to ignore
EXCLUDE_FAN_IDS = {483664969, 482383508, 525755724}
EXCLUDE_USERNAMES = {"nij444", "tylerd34"}

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(LOG_FILE)
    ]
)
log = logging.getLogger("webhook-queue")

_queue_lock = threading.Lock()
stats = {
    "started_at": datetime.now(timezone.utc).isoformat(),
    "webhooks_received": 0,
    "messages_queued": 0,
    "subs_received": 0,
    "purchases_received": 0,
    "skipped": 0,
    "errors": 0,
}

def load_queue():
    try:
        with open(QUEUE_FILE) as f:
            return json.load(f)
    except:
        return {"pending": [], "processed": []}

def save_queue(q):
    with open(QUEUE_FILE, "w") as f:
        json.dump(q, f, indent=2)

def queue_message(fan_id, fan_name, message_text, event_type="message", extra=None):
    """Add a fan message/event to the queue. NO SENDING."""
    with _queue_lock:
        q = load_queue()
        entry = {
            "fan_id": fan_id,
            "fan_name": fan_name or "",
            "message": message_text,
            "event_type": event_type,
            "ts": time.time(),
            "ts_human": datetime.now(timezone.utc).isoformat(),
        }
        if extra:
            entry.update(extra)
        # Purchases and new subs go to FRONT of queue
        if event_type in ("purchase", "new_sub"):
            q["pending"].insert(0, entry)
        else:
            q["pending"].append(entry)
        save_queue(q)
    log.info(f"QUEUED [{event_type}] fan={fan_id} name={fan_name}: {message_text[:80]}")

class WebhookHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass  # Suppress default HTTP logging

    def send_json(self, code, data):
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

    def do_GET(self):
        path = self.path.split("?")[0]
        
        if path == "/health":
            self.send_json(200, {
                "status": "ok",
                "mode": "QUEUE_ONLY",
                "sends_messages": False,
                "ts": datetime.now(timezone.utc).isoformat(),
            })
        elif path == "/stats":
            q = load_queue()
            self.send_json(200, {
                **stats,
                "pending_count": len(q.get("pending", [])),
                "mode": "QUEUE_ONLY — does NOT send messages",
            })
        elif path == "/queue":
            q = load_queue()
            self.send_json(200, q)
        elif path == "/queue/pending":
            q = load_queue()
            self.send_json(200, {"pending": q.get("pending", [])})
        else:
            self.send_json(404, {"error": "not found"})

    def do_POST(self):
        path = self.path.split("?")[0]
        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length) if content_length > 0 else b"{}"
        
        if path == "/webhook/of-event":
            try:
                data = json.loads(body)
                stats["webhooks_received"] += 1
                event = data.get("event", "")
                payload = data.get("payload", {})
                
                if event == "messages.received":
                    fan_id = payload.get("fromUser", {}).get("id")
                    fan_name = payload.get("fromUser", {}).get("name", "")
                    username = payload.get("fromUser", {}).get("username", "")
                    text = payload.get("text", "")
                    
                    # Strip HTML
                    import re
                    text = re.sub(r'<[^>]+>', '', text).strip()
                    
                    if not fan_id or fan_id == BIANCA_USER_ID:
                        stats["skipped"] += 1
                        self.send_json(200, {"status": "skipped", "reason": "self or no fan_id"})
                        return
                    
                    if int(fan_id) in EXCLUDE_FAN_IDS:
                        stats["skipped"] += 1
                        self.send_json(200, {"status": "skipped", "reason": "excluded"})
                        return
                    
                    if username and username.lower() in EXCLUDE_USERNAMES:
                        stats["skipped"] += 1
                        self.send_json(200, {"status": "skipped", "reason": "excluded username"})
                        return
                    
                    queue_message(fan_id, fan_name, text, "message")
                    stats["messages_queued"] += 1
                    self.send_json(200, {"status": "queued"})
                
                elif event == "subscriptions.new":
                    fan_id = payload.get("userId") or payload.get("subscriberId")
                    fan_name = payload.get("username", "")
                    queue_message(fan_id, fan_name, "NEW_SUBSCRIBER", "new_sub")
                    stats["subs_received"] += 1
                    self.send_json(200, {"status": "queued"})
                
                elif event in ("messages.ppv.unlocked", "transactions.new"):
                    # Try multiple paths for fan ID
                    fan_id = (payload.get("fromUser", {}).get("id") 
                              or payload.get("userId")
                              or payload.get("user_id")
                              or payload.get("subscriberId")
                              or payload.get("fan", {}).get("id"))
                    fan_name = (payload.get("fromUser", {}).get("name", "")
                                or payload.get("username", ""))
                    amount = payload.get("amount") or payload.get("price", 0)
                    log.info(f"PURCHASE EVENT: fan={fan_id} amount={amount} raw_keys={list(payload.keys())}")
                    queue_message(fan_id, fan_name, f"PURCHASE ${amount}", "purchase", {"amount": amount, "raw_payload_keys": list(payload.keys())})
                    stats["purchases_received"] += 1
                    self.send_json(200, {"status": "queued"})
                
                else:
                    log.info(f"IGNORED event: {event}")
                    self.send_json(200, {"status": "ignored"})
            
            except Exception as e:
                log.error(f"Webhook error: {e}")
                stats["errors"] += 1
                self.send_json(500, {"error": str(e)})
        
        elif path == "/queue/clear":
            try:
                data = json.loads(body)
                fan_ids = data.get("fan_ids", [])
                with _queue_lock:
                    q = load_queue()
                    before = len(q["pending"])
                    cleared = [e for e in q["pending"] if e["fan_id"] in fan_ids]
                    q["pending"] = [e for e in q["pending"] if e["fan_id"] not in fan_ids]
                    q["processed"].extend(cleared)
                    # Keep processed list manageable
                    q["processed"] = q["processed"][-500:]
                    save_queue(q)
                self.send_json(200, {"cleared": len(cleared), "remaining": len(q["pending"])})
            except Exception as e:
                self.send_json(500, {"error": str(e)})
        
        else:
            self.send_json(404, {"error": "not found"})

# === Cloudflare tunnel ===
import subprocess

def start_tunnel():
    """Start cloudflared tunnel and update OF webhook."""
    try:
        proc = subprocess.Popen(
            ["/opt/homebrew/bin/cloudflared", "tunnel", "--url", "http://localhost:8901", "--no-autoupdate"],
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True
        )
        url = None
        for line in iter(proc.stdout.readline, ''):
            if "trycloudflare.com" in line:
                import re
                m = re.search(r'https://[a-z0-9-]+\.trycloudflare\.com', line)
                if m:
                    url = m.group(0)
                    log.info(f"Tunnel URL: {url}")
                    # Update OF webhook
                    import urllib.request
                    webhook_id = "wh_bd0b30a283264387be49bb8103063e31"
                    api_key = "ofapi_bT4J1Er2YBow46EihDfjlSFf5HRmiM15M4DCOoHn7889d8b4"
                    req = urllib.request.Request(
                        f"https://app.onlyfansapi.com/api/webhooks/{webhook_id}",
                        data=json.dumps({
                            "endpoint_url": f"{url}/webhook",
                            "events": ["messages.received", "messages.ppv.unlocked", "subscriptions.new", "transactions.new"],
                            "account_scope": "global",
                            "account_ids": []
                        }).encode(),
                        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                        method="PUT"
                    )
                    resp = urllib.request.urlopen(req)
                    result = json.loads(resp.read())
                    log.info(f"Updated webhook URL to {url}/webhook: {result.get('data',{}).get('url','?')}")
                    break
    except Exception as e:
        log.error(f"Tunnel error: {e}")

if __name__ == "__main__":
    # Start tunnel in background
    threading.Thread(target=start_tunnel, daemon=True).start()
    
    server = HTTPServer(("127.0.0.1", 8901), WebhookHandler)
    log.info("Bianca Webhook Queue starting on port 8901 — QUEUE ONLY, NO SENDS")
    server.serve_forever()
