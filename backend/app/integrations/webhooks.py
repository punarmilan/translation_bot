import logging
import json
import hmac
import hashlib
from datetime import datetime
from typing import Any, Dict, List
import httpx
from app.database import get_db

logger = logging.getLogger(__name__)

class WebhookManager:
    async def register_webhook(self, url: str, secret: str, events: List[str]) -> Dict[str, Any]:
        db = get_db()
        doc = {
            "url": url.strip(),
            "secret": secret.strip(),
            "events": [e.strip().lower() for e in events],
            "enabled": True,
            "created_at": datetime.utcnow()
        }
        res = await db["webhooks"].insert_one(doc)
        doc["_id"] = str(res.inserted_id)
        doc["created_at"] = doc["created_at"].isoformat()
        return doc

    async def list_webhooks(self) -> List[Dict[str, Any]]:
        db = get_db()
        cursor = db["webhooks"].find({})
        rows = await cursor.to_list(length=100)
        for r in rows:
            r["_id"] = str(r["_id"])
            if "created_at" in r:
                r["created_at"] = r["created_at"].isoformat()
        return rows

    async def dispatch_event(self, event_type: str, payload: Dict[str, Any]) -> None:
        """
        Asynchronously sends secure callbacks signed with HMAC-SHA256 to subscribed endpoints.
        """
        db = get_db()
        event_type = event_type.lower().strip()
        webhooks = await db["webhooks"].find({"events": event_type, "enabled": True}).to_list(length=100)
        
        if not webhooks:
            return

        payload_json = json.dumps({
            "event": event_type,
            "timestamp": datetime.utcnow().isoformat(),
            "data": payload
        }, sort_keys=True)
        
        async with httpx.AsyncClient() as client:
            for hook in webhooks:
                url = hook["url"]
                secret = hook["secret"].encode("utf-8")
                
                # Compute signature
                signature = hmac.new(
                    secret,
                    payload_json.encode("utf-8"),
                    hashlib.sha256
                ).hexdigest()
                
                headers = {
                    "Content-Type": "application/json",
                    "X-TranslationBot-Signature": signature,
                    "X-TranslationBot-Event": event_type
                }
                
                try:
                    # Non-blocking fire and forget
                    response = await client.post(url, content=payload_json, headers=headers, timeout=5.0)
                    logger.info(f"Webhook dispatch to {url} returned status code {response.status_code}")
                except Exception as e:
                    logger.error(f"Failed to dispatch webhook event to {url}: {e}")

webhook_manager = WebhookManager()
