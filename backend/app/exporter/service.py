import logging
import json
from datetime import datetime
from typing import Any, Dict, Optional
from app.database import get_db

logger = logging.getLogger(__name__)

class MeetingExporter:
    async def export_meeting(self, room_id: str, format_type: str) -> tuple[bytes, str, str]:
        """
        Gathers meeting logs, transcripts, notes, and summaries, and packages them.
        Returns: (file_bytes, media_type, filename)
        """
        db = get_db()
        room = await db["rooms"].find_one({"room_id": room_id})
        if not room:
            raise ValueError("Room not found")

        # Fetch all messages/transcripts
        messages = await db["messages"].find({"room_id": room_id}).sort("timestamp", 1).to_list(length=5000)
        # Fetch summaries
        summary = await db["meeting_summaries"].find_one({"room_id": room_id})
        # Fetch recordings
        recordings = await db["recordings"].find({"room_id": room_id}).to_list(length=100)

        # Build combined data structure
        exported_data = {
            "room_id": room_id,
            "room_name": room.get("room_name") or room_id,
            "created_at": room.get("created_at").isoformat() if isinstance(room.get("created_at"), datetime) else str(room.get("created_at")),
            "summary": {
                "summary_text": (summary or {}).get("summary_text", "No summary available."),
                "action_items": (summary or {}).get("action_items", []),
                "decisions": (summary or {}).get("decisions", []),
                "deadlines": (summary or {}).get("deadlines", []),
                "open_questions": (summary or {}).get("open_questions", []),
                "topics": (summary or {}).get("topics", []),
                "follow_up_notes": (summary or {}).get("follow_up_notes", "")
            },
            "shared_notes": room.get("notes_content") or "",
            "whiteboard": {
                "shapes_count": len(room.get("whiteboard_shapes") or []),
                "shapes": room.get("whiteboard_shapes") or []
            },
            "transcripts": [
                {
                    "speaker": m.get("sender_name") or m.get("speaker") or "Unknown",
                    "original_text": m.get("original_text", ""),
                    "translations": m.get("translations", {}),
                    "source_language": m.get("source_language", "en"),
                    "timestamp": m.get("timestamp").isoformat() if isinstance(m.get("timestamp"), datetime) else str(m.get("timestamp")),
                    "confidence": m.get("confidence", 0.95)
                }
                for m in messages
            ],
            "recordings": [
                {
                    "host": r.get("host_username"),
                    "duration_seconds": r.get("duration_seconds"),
                    "started_at": r.get("started_at").isoformat() if isinstance(r.get("started_at"), datetime) else str(r.get("started_at")),
                    "stopped_at": r.get("stopped_at").isoformat() if isinstance(r.get("stopped_at"), datetime) else str(r.get("stopped_at"))
                }
                for r in recordings
            ]
        }

        format_type = format_type.lower().strip()
        if format_type == "json":
            payload = json.dumps(exported_data, indent=2).encode("utf-8")
            return payload, "application/json", f"{room_id}-export.json"

        elif format_type == "markdown" or format_type == "md":
            md = self._to_markdown(exported_data)
            return md.encode("utf-8"), "text/markdown", f"{room_id}-export.md"

        elif format_type == "html":
            html = self._to_html(exported_data)
            return html.encode("utf-8"), "text/html", f"{room_id}-export.html"

        elif format_type == "pdf":
            # ReportLab PDF compilation fallback to HTML format or clean layout
            # In order to stay dependency-free, we generate a high-quality PDF wrapper containing the summary/logs
            # or fallback to formatted text matching reportlab if installed.
            try:
                from reportlab.lib.pagesizes import letter
                from reportlab.pdfgen import canvas
                import io
                
                buffer = io.BytesIO()
                p = canvas.Canvas(buffer, pagesize=letter)
                p.drawString(100, 750, f"Meeting Export Report: {exported_data['room_name']}")
                p.drawString(100, 730, f"Room ID: {exported_data['room_id']}")
                p.drawString(100, 715, f"Date: {exported_data['created_at']}")
                
                p.drawString(100, 680, "Summary:")
                y = 660
                summary_lines = exported_data["summary"]["summary_text"].split(". ")
                for line in summary_lines[:5]:
                    p.drawString(120, y, f"- {line}")
                    y -= 20
                
                y -= 20
                p.drawString(100, y, "Action Items:")
                y -= 20
                for item in exported_data["summary"]["action_items"][:5]:
                    p.drawString(120, y, f"- [{item.get('assignee', 'Unknown')}] {item.get('task', '')}")
                    y -= 20
                    
                y -= 20
                p.drawString(100, y, "Decisions:")
                y -= 20
                for d in exported_data["summary"]["decisions"][:5]:
                    p.drawString(120, y, f"- {d}")
                    y -= 20
                
                p.showPage()
                p.save()
                buffer.seek(0)
                return buffer.getvalue(), "application/pdf", f"{room_id}-export.pdf"
            except Exception as e:
                # If ReportLab is not available, we return the beautifully structured html representation with a pdf filename.
                # Browsers handle HTML content served under pdf filename or vice versa transparently, but let's provide HTML fallback.
                logger.warning(f"Reportlab PDF engine not found. Fallback to HTML bytes. {e}")
                html = self._to_html(exported_data)
                return html.encode("utf-8"), "text/html", f"{room_id}-export.html"

        else:
            raise ValueError(f"Unsupported export format: {format_type}")

    def _to_markdown(self, data: dict) -> str:
        md = []
        md.append(f"# Meeting Export Report: {data['room_name']}")
        md.append(f"**Room ID:** {data['room_id']}  ")
        md.append(f"**Created At:** {data['created_at']}  \n")
        
        md.append("## Meeting Intelligence Summary")
        md.append(f"{data['summary']['summary_text']}\n")
        
        md.append("### Decisions Made")
        if data["summary"]["decisions"]:
            for d in data["summary"]["decisions"]:
                md.append(f"- [x] {d}")
        else:
            md.append("No decisions recorded.")
        md.append("")
        
        md.append("### Action Items")
        if data["summary"]["action_items"]:
            for item in data["summary"]["action_items"]:
                md.append(f"- [ ] **{item.get('assignee', 'Unassigned')}**: {item.get('task')} (Due: {item.get('deadline')})")
        else:
            md.append("No action items recorded.")
        md.append("")
        
        md.append("### Open Questions")
        if data["summary"]["open_questions"]:
            for q in data["summary"]["open_questions"]:
                md.append(f"- ? {q}")
        else:
            md.append("No open questions recorded.")
        md.append("")

        md.append("## Shared Notes")
        if data["shared_notes"]:
            md.append(data["shared_notes"])
        else:
            md.append("*No shared notes recorded.*")
        md.append("")

        md.append(f"## Whiteboard Details")
        md.append(f"Total shapes drawn: {data['whiteboard']['shapes_count']}\n")

        md.append("## Transcripts & Translation Logs")
        if data["transcripts"]:
            for t in data["transcripts"]:
                md.append(f"**[{t['timestamp']}] {t['speaker']}:** {t['original_text']}")
                for lang, trans in t["translations"].items():
                    md.append(f"  *↳ Translated ({lang.upper()}):* {trans}")
        else:
            md.append("*No spoken conversation transcripts found.*")
            
        return "\n".join(md)

    def _to_html(self, data: dict) -> str:
        # Standard responsive HTML document structure with modern premium styles
        html = []
        html.append("<!DOCTYPE html>")
        html.append("<html>")
        html.append("<head>")
        html.append("<title>Meeting Export</title>")
        html.append("<style>")
        html.append("body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #cbd5e1; padding: 40px 20px; line-height: 1.6; }")
        html.append(".container { max-width: 800px; margin: 0 auto; background: #1e293b; padding: 40px; border-radius: 16px; border: 1px solid rgba(255,255,255,0.06); box-shadow: 0 10px 30px rgba(0,0,0,0.25); }")
        html.append("h1 { color: #f8fafc; border-bottom: 2px solid #4f46e5; padding-bottom: 12px; margin-top: 0; }")
        html.append("h2, h3 { color: #f1f5f9; margin-top: 30px; }")
        html.append(".badge { display: inline-block; background: rgba(79, 70, 229, 0.15); color: #818cf8; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: bold; }")
        html.append(".section { background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.04); padding: 20px; border-radius: 8px; margin-bottom: 20px; }")
        html.append("ul { padding-left: 20px; }")
        html.append(".log-item { border-bottom: 1px solid rgba(255,255,255,0.04); padding: 12px 0; }")
        html.append(".log-item:last-child { border-bottom: none; }")
        html.append("</style>")
        html.append("</head>")
        html.append("<body>")
        html.append("<div class='container'>")
        
        html.append(f"<h1>Meeting: {data['room_name']}</h1>")
        html.append(f"<p><strong>Room ID:</strong> {data['room_id']} | <strong>Date:</strong> {data['created_at']}</p>")
        
        # Summary Section
        html.append("<div class='section'>")
        html.append("<h2>Meeting Intelligence Summary</h2>")
        html.append(f"<p>{data['summary']['summary_text']}</p>")
        
        html.append("<h3>Decisions</h3>")
        if data["summary"]["decisions"]:
            html.append("<ul>")
            for d in data["summary"]["decisions"]:
                html.append(f"<li>{d}</li>")
            html.append("</ul>")
        else:
            html.append("<p>No decisions made.</p>")
            
        html.append("<h3>Action Items</h3>")
        if data["summary"]["action_items"]:
            html.append("<ul>")
            for item in data["summary"]["action_items"]:
                html.append(f"<li><strong>{item.get('assignee', 'Unassigned')}</strong>: {item.get('task')} (Due: {item.get('deadline')})</li>")
            html.append("</ul>")
        else:
            html.append("<p>No action items.</p>")
        html.append("</div>")

        # Shared Notes
        html.append("<div class='section'>")
        html.append("<h2>Shared Notes</h2>")
        if data["shared_notes"]:
            html.append(f"<pre style='white-space: pre-wrap; font-family: inherit;'>{data['shared_notes']}</pre>")
        else:
            html.append("<p>No shared notes recorded.</p>")
        html.append("</div>")

        # Whiteboard Details
        html.append("<div class='section'>")
        html.append("<h2>Whiteboard shapes</h2>")
        html.append(f"<p>Total shapes drawn during session: {data['whiteboard']['shapes_count']}</p>")
        html.append("</div>")

        # Transcripts
        html.append("<div class='section'>")
        html.append("<h2>Transcript & Translation Timeline</h2>")
        if data["transcripts"]:
            for t in data["transcripts"]:
                html.append("<div class='log-item'>")
                html.append(f"<p><strong>[{t['timestamp']}] {t['speaker']}:</strong> {t['original_text']}</p>")
                for lang, trans in t["translations"].items():
                    html.append(f"<p style='color: #a78bfa; padding-left: 20px; margin: 4px 0;'>↳ ({lang.upper()}): {trans}</p>")
                html.append("</div>")
        else:
            html.append("<p>No transcription log found.</p>")
        html.append("</div>")

        html.append("</div>")
        html.append("</body>")
        html.append("</html>")
        return "\n".join(html)

meeting_exporter = MeetingExporter()
