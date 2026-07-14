import logging
import re
from abc import ABC, abstractmethod
from datetime import datetime
from typing import Any, Dict, List, Optional
from app.database import get_db

logger = logging.getLogger(__name__)

# Standard stop words for topic extraction
STOP_WORDS = {
    "the", "a", "an", "and", "or", "but", "if", "then", "else", "when", "at", "by", "for", "with", "about",
    "against", "between", "into", "through", "during", "before", "after", "above", "below", "to", "from",
    "up", "down", "in", "out", "on", "off", "over", "under", "again", "further", "then", "once", "here",
    "there", "all", "any", "both", "each", "few", "more", "most", "other", "some", "such", "no", "nor",
    "not", "only", "own", "same", "so", "than", "too", "very", "s", "t", "can", "will", "just", "don",
    "should", "now", "i", "me", "my", "myself", "we", "our", "ours", "ourselves", "you", "your", "yours",
    "yourself", "yourselves", "he", "him", "his", "himself", "she", "her", "hers", "herself", "it", "its",
    "itself", "they", "them", "their", "theirs", "themselves", "what", "which", "who", "whom", "this",
    "that", "these", "those", "am", "is", "are", "was", "were", "be", "been", "being", "have", "has", "had",
    "having", "do", "does", "did", "doing", "would", "could", "should", "ought", "i'm", "you're", "he's",
    "she's", "it's", "we're", "they're", "i've", "you've", "we've", "they've", "i'd", "you'd", "he'd",
    "she'd", "we'd", "they'd", "i'll", "you'll", "he'll", "she'll", "we'll", "they'll", "isn't", "aren't",
    "wasn't", "weren't", "hasn't", "haven't", "hadn't", "doesn't", "don't", "didn't", "won't", "wouldn't",
    "shan't", "shouldn't", "can't", "cannot", "couldn't", "mustn't", "let's", "that's", "who's", "what's",
    "here's", "there's", "when's", "where's", "why's", "how's", "a", "b", "c", "d", "e", "f", "g", "h", "i",
    "j", "k", "l", "m", "n", "o", "p", "q", "r", "s", "t", "u", "v", "w", "x", "y", "z"
}

# --- Module Interfaces ---

class MeetingIntelligenceModule(ABC):
    @abstractmethod
    async def process(self, transcripts: List[Dict[str, Any]]) -> Any:
        pass


class SummaryGenerator(MeetingIntelligenceModule, ABC):
    pass


class ActionItemExtractor(MeetingIntelligenceModule, ABC):
    pass


class DecisionExtractor(MeetingIntelligenceModule, ABC):
    pass


class QuestionExtractor(MeetingIntelligenceModule, ABC):
    pass


class DeadlineExtractor(MeetingIntelligenceModule, ABC):
    pass


class TopicExtractor(MeetingIntelligenceModule, ABC):
    pass

# --- Heuristic Implementations ---

class HeuristicSummaryGenerator(SummaryGenerator):
    async def process(self, transcripts: List[Dict[str, Any]]) -> str:
        if not transcripts:
            return "No transcripts available for summary."
        
        # Simple clustering or extractive summarization
        # Count words, pick key representative sentences (e.g. sentences starting with we, decision verbs, or greetings)
        key_sentences = []
        for t in transcripts:
            text = t.get("original_text", "").strip()
            sentences = [s.strip() for s in re.split(r'[.!?]+', text) if s.strip()]
            for s in sentences:
                lower = s.lower()
                if any(k in lower for k in ["decided", "agree", "discuss", "should", "will", "meeting", "goal", "plan", "review"]):
                    if s not in key_sentences:
                        key_sentences.append(s)
        
        if not key_sentences:
            fallback_sentences = []
            for t in transcripts[:5]:
                fallback_sentences.extend([s.strip() for s in re.split(r'[.!?]+', t.get("original_text", "")) if s.strip()])
            key_sentences = fallback_sentences[:3]
            
        summary_body = ". ".join(key_sentences) + "."
        return f"This meeting covered the following active discussions: {summary_body}"


class HeuristicActionItemExtractor(ActionItemExtractor):
    async def process(self, transcripts: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        action_items = []
        pattern = re.compile(
            r"\b(i|we|you|he|she|they|co-host|host)\b\s+(will|should|must|need\s+to|have\s+to|scheduled\s+to)\s+([\w\s',-]{6,100})",
            re.IGNORECASE
        )
        for t in transcripts:
            speaker = t.get("sender_name") or t.get("speaker") or "Unknown"
            text = t.get("original_text", "").strip()
            matches = pattern.finditer(text)
            for m in matches:
                subject = m.group(1).lower()
                verb_phrase = m.group(2)
                task = m.group(3).strip()
                assignee = speaker if subject in ["i", "myself"] else ("Everyone" if subject == "we" else subject)
                
                deadline_match = re.search(r"\bby\s+(tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|next week|end of the day|[\d/\-\.]+)", task, re.IGNORECASE)
                deadline = deadline_match.group(1) if deadline_match else "No deadline specified"
                
                action_items.append({
                    "task": f"{verb_phrase} {task}".strip(),
                    "assignee": assignee,
                    "deadline": deadline,
                    "context_transcript": text
                })
        return action_items


class HeuristicDecisionExtractor(DecisionExtractor):
    async def process(self, transcripts: List[Dict[str, Any]]) -> List[str]:
        decisions = []
        pattern = re.compile(
            r"\b(we|they|everyone|all|group)\b\s+(decided|agreed|resolved|confirmed|approved|voted)\s+(to\s+[\w\s',-]{5,100}|that\s+[\w\s',-]{5,100}|on\s+[\w\s',-]{5,100})",
            re.IGNORECASE
        )
        for t in transcripts:
            text = t.get("original_text", "").strip()
            matches = pattern.finditer(text)
            for m in matches:
                decision_desc = f"{m.group(1)} {m.group(2)} {m.group(3)}".strip()
                if decision_desc not in decisions:
                    decisions.append(decision_desc)
        return decisions


class HeuristicQuestionExtractor(QuestionExtractor):
    async def process(self, transcripts: List[Dict[str, Any]]) -> List[str]:
        questions = []
        for t in transcripts:
            text = t.get("original_text", "").strip()
            sentences = [s.strip() for s in re.split(r'[.!?]+', text) if s.strip()]
            for s in sentences:
                lower = s.lower()
                is_question_word = lower.startswith(("who", "what", "where", "why", "how", "when", "which", "whose", "is", "are", "do", "does", "did", "can", "could", "should", "would", "will", "shall"))
                if is_question_word or "?" in s:
                    if s not in questions:
                        questions.append(s)
        return questions


class HeuristicDeadlineExtractor(DeadlineExtractor):
    async def process(self, transcripts: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        deadlines = []
        pattern = re.compile(
            r"\b(deadline|due|finish|complete|deliver|submit)\b\s+(?:is|by|on|at|before)?\s+(tomorrow|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday|next week|[\d/\-\.]+)",
            re.IGNORECASE
        )
        for t in transcripts:
            text = t.get("original_text", "").strip()
            matches = pattern.finditer(text)
            for m in matches:
                trigger = m.group(1)
                due_date = m.group(2)
                deadlines.append({
                    "task": text,
                    "trigger_word": trigger,
                    "due_date": due_date
                })
        return deadlines


class HeuristicTopicExtractor(TopicExtractor):
    async def process(self, transcripts: List[Dict[str, Any]]) -> List[str]:
        word_counts = {}
        for t in transcripts:
            text = t.get("original_text", "").strip()
            words = re.findall(r"\b[a-zA-Z]{3,20}\b", text.lower())
            for w in words:
                if w not in STOP_WORDS:
                    word_counts[w] = word_counts.get(w, 0) + 1
        
        sorted_words = sorted(word_counts.items(), key=lambda x: x[1], reverse=True)
        return [w[0].capitalize() for w in sorted_words[:5]]

# --- Modular Meeting Intelligence Engine Coordinator ---

class MeetingIntelligenceEngine:
    def __init__(self) -> None:
        self.summary_gen = HeuristicSummaryGenerator()
        self.actions_ext = HeuristicActionItemExtractor()
        self.decisions_ext = HeuristicDecisionExtractor()
        self.questions_ext = HeuristicQuestionExtractor()
        self.deadlines_ext = HeuristicDeadlineExtractor()
        self.topics_ext = HeuristicTopicExtractor()

    async def generate_summary(self, room_id: str) -> Optional[Dict[str, Any]]:
        """
        Runs the full heuristic intelligence pipeline over room transcripts.
        """
        db = get_db()
        transcripts = await db["messages"].find({"room_id": room_id}).sort("timestamp", 1).to_list(length=2000)
        
        if not transcripts:
            logger.info(f"No transcripts found for room {room_id}. Intelligence skip.")
            return None
        
        summary_text = await self.summary_gen.process(transcripts)
        action_items = await self.actions_ext.process(transcripts)
        decisions = await self.decisions_ext.process(transcripts)
        open_questions = await self.questions_ext.process(transcripts)
        deadlines = await self.deadlines_ext.process(transcripts)
        topics = await self.topics_ext.process(transcripts)
        
        timeline = []
        for t in transcripts:
            speaker = t.get("sender_name") or t.get("speaker") or "Unknown"
            ts = t.get("timestamp")
            ts_str = ts.isoformat() if isinstance(ts, datetime) else str(ts)
            txt = t.get("original_text", "")
            timeline.append({
                "time": ts_str,
                "speaker": speaker,
                "event": txt
            })
            
        follow_up_notes = (
            f"Here are the follow-up notes for the meeting in room {room_id}.\n\n"
            f"Summary:\n{summary_text}\n\n"
            f"Key Actions:\n" + "\n".join([f"- Assignee: {ai['assignee']} | Task: {ai['task']} (Due: {ai['deadline']})" for ai in action_items]) + "\n\n"
            f"Decisions Made:\n" + "\n".join([f"- {d}" for d in decisions]) + "\n\n"
            f"Open Questions Raised:\n" + "\n".join([f"- {q}" for q in open_questions])
        )
        
        summary_doc = {
            "room_id": room_id,
            "summary_text": summary_text,
            "action_items": action_items,
            "decisions": decisions,
            "deadlines": deadlines,
            "open_questions": open_questions,
            "topics": topics,
            "follow_up_notes": follow_up_notes,
            "timeline": timeline,
            "generated_at": datetime.utcnow()
        }
        
        await db["meeting_summaries"].update_one(
            {"room_id": room_id},
            {"$set": summary_doc},
            upsert=True
        )
        logger.info(f"Successfully generated offline meeting intelligence report for room {room_id}")
        return summary_doc

    async def get_summary(self, room_id: str) -> Optional[Dict[str, Any]]:
        db = get_db()
        summary = await db["meeting_summaries"].find_one({"room_id": room_id})
        if summary:
            summary["_id"] = str(summary["_id"])
            if isinstance(summary.get("generated_at"), datetime):
                summary["generated_at"] = summary["generated_at"].isoformat()
        return summary

meeting_intelligence_engine = MeetingIntelligenceEngine()
