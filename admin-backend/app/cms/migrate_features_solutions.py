"""One-time, idempotent migration of the Features and Solutions pages onto
the generic CMS engine (Phase 4). Runs at admin-backend startup; a no-op on
every run after the first, mirroring migrate_landing.py's approach for the
same reason: a one-off seed for two specific, pre-existing pages is
page-specific, so it lives here rather than in the page-agnostic
CmsRepository/cms.py router.

The seeded card content is transcribed verbatim from the previously-hardcoded
arrays in frontend/src/pages/FeaturesPage.jsx and SolutionsPage.jsx, so
publishing this migration's output changes nothing about what visitors see --
it only moves the data from a frontend array into an admin-editable CMS page.
Icons are stored as lucide-react component names (matching the convention
already used by the Landing page's showcase cards); the public frontend maps
these back to real icon components with a fallback glyph for unknown names.
"""

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.repositories.cms_repository import CmsRepository

FEATURES_PAGE_KEY = "features"
FEATURES_PAGE_LABEL = "Features"
SOLUTIONS_PAGE_KEY = "solutions"
SOLUTIONS_PAGE_LABEL = "Solutions"
MIGRATION_ACTOR = "system:migration"


def _feature_card(icon: str, eyebrow: str, title: str, description: str, benefits: list[str], why: str, use: str) -> dict:
    return {
        "icon": icon,
        "eyebrow": eyebrow,
        "title": title,
        "description": description,
        "benefits": "\n".join(benefits),
        "why_it_matters": why,
        "use_cases": use,
        "image_url": "",
        "cta_text": "",
        "cta_link": "",
        "hidden": False,
    }


def _capability_card(icon: str, title: str, description: str, why: str, use: str) -> dict:
    return _feature_card(icon, "", title, description, [], why, use)


FLAGSHIP_CARDS = [
    _feature_card(
        "Languages", "Multilingual meetings",
        "One conversation, personalized for every listener",
        "Participants speak naturally while translated captions, chat, and voice playback follow each listener's language preference.",
        ["Per-participant language routing", "Original audio preserved when languages match", "Speaker-aware output"],
        "Nobody has to become the room's unofficial interpreter.",
        "International planning, classes, and family calls.",
    ),
    _feature_card(
        "AudioLines", "AI voice translation",
        "Hear translated speech without leaving the meeting",
        "Spoken ideas become translated text and generated voice, queued automatically so clips remain understandable.",
        ["Automatic playback", "One result per target language", "Voice preference routing"],
        "Listening is more natural than monitoring a separate transcript window.",
        "Remote teams, multilingual consultations, and live events.",
    ),
    _feature_card(
        "MessageCircle", "Translated chat",
        "Write once. Let every recipient read naturally.",
        "Messages can reach everyone or one intended participant while preserving the room's host and participant rules.",
        ["Broadcast and direct messages", "Per-recipient translation", "Smart message delivery"],
        "Written collaboration should not require copying text into another tool.",
        "Meeting notes, links, private clarifications, and host announcements.",
    ),
    _feature_card(
        "Video", "Video conferencing",
        "Clear face-to-face meetings with familiar controls",
        "Join from a browser, see participants clearly, and control microphone and camera without interrupting translation.",
        ["Large responsive video tiles", "Mute and camera controls", "Stable peer-to-peer streams"],
        "Translation belongs inside the meeting, not beside a disconnected call product.",
        "Two-person meetings today, with a path toward larger hosted rooms.",
    ),
]

CAPABILITY_CARDS = [
    _capability_card("Captions", "Live translated captions", "Original and translated text with speaker and detected-language context.", "Keeps every spoken idea visible.", "Interviews and lectures."),
    _capability_card("Radio", "Voice conferencing", "Audio-first meetings for participants who do not need camera.", "Reduces bandwidth and distraction.", "Quick calls and low-bandwidth access."),
    _capability_card("Users", "Role-based management", "Host, participant, and admin responsibilities remain distinct.", "Keeps room actions predictable.", "Classes and moderated meetings."),
    _capability_card("Link2", "Meeting links", "Invite participants using a shareable room URL.", "Removes manual room setup.", "Scheduled and spontaneous meetings."),
    _capability_card("Mic", "Speech recognition", "Spoken words become time-stamped text instantly.", "Creates the foundation for captions and translation.", "Any spoken meeting."),
    _capability_card("Waypoints", "Translation pipeline", "Detected speech is translated only where languages differ.", "Avoids redundant translation overhead.", "Mixed-language rooms."),
    _capability_card("Volume2", "Voice synthesis", "Translated text is converted into listener-language speech.", "Makes translated meetings easier to follow.", "Hands-free participation."),
    _capability_card("RefreshCw", "Translation memory", "Repeated messages reuse cached results.", "Improves speed and responsiveness.", "Recurring instructions and phrases."),
    _capability_card("Languages", "Language switching", "Change preferred language without creating a new account.", "Supports evolving meeting needs.", "Bilingual participants."),
    _capability_card("MonitorSmartphone", "Cross-platform access", "Responsive meetings across modern desktop, tablet, and mobile browsers.", "Participants can join from any available device.", "Remote and field work."),
    _capability_card("LockKeyhole", "Secure profile access", "Protected profiles and rooms with persistent user identity.", "Prevents anonymous room access.", "Private organizational meetings."),
    _capability_card("BarChart3", "Meeting analytics", "Room activity, languages, and message counts are visible.", "Helps hosts understand participation.", "Operations and learning programs."),
    _capability_card("ShieldCheck", "Moderator tools", "Manage user access and room parameters safely.", "Supports responsible platform operations.", "Internal administration."),
    _capability_card("Waves", "Real-time communication", "Real-time peer audio and video stream delivery.", "Keeps communication responsive.", "Browser-to-browser meetings."),
    _capability_card("CircleGauge", "Latency monitoring", "Pipeline timings are measured to track quality.", "Makes connection quality metrics transparent.", "Performance troubleshooting."),
    _capability_card("SquareUserRound", "Participant status", "See connection, media, and translation state per participant.", "Reduces uncertainty during group calls.", "All meetings."),
    _capability_card("Activity", "Diagnostics dashboard", "Inspect microphone, speaker, and camera health dynamically.", "Enables quick cross-device troubleshooting.", "Development and support."),
    _capability_card("ScreenShare", "Screen sharing", "Present documents and applications inside meetings.", "Supports richer collaboration.", "Coming soon."),
    _capability_card("ChartNoAxesCombined", "Meeting recording", "Capture meetings for approved playback and review.", "Preserves important sessions.", "Coming soon."),
    _capability_card("Sparkles", "AI summaries", "Turn completed meetings into concise decisions and follow-ups.", "Reduces manual note taking.", "Coming soon."),
]


def _solution_card(icon: str, category: str, problem: str, pains: list[str], solution: str, impact: str, image: str | None) -> dict:
    return {
        "icon": icon,
        "category": category,
        "title": problem,
        "pain_points": "\n".join(pains),
        "description": solution,
        "impact": impact,
        "image_url": image or "",
        "cta_text": "",
        "cta_link": "",
        "hidden": False,
    }


SOLUTION_CARDS = [
    _solution_card("GraduationCap", "Education", "Students struggle when lectures use an unfamiliar language.", ["Lower participation", "Missed context", "Limited international access"], "Deliver translated lectures, captions, and classroom chat in each student's language.", "More inclusive classes and stronger participation.", "/images/online-classroom.png"),
    _solution_card("HeartPulse", "Healthcare", "Doctors and patients may not share enough language for a clear consultation.", ["Misunderstood symptoms", "Repeated explanations", "Patient anxiety"], "Support multilingual consultations with visible original and translated transcripts.", "Clearer conversations and fewer avoidable misunderstandings.", None),
    _solution_card("BriefcaseBusiness", "International business", "Global teams lose time translating decisions after meetings.", ["Slow decisions", "Interpreter scheduling", "Unequal participation"], "Let team members speak, read, and reply in their preferred language during the same call.", "Faster collaboration across markets.", "/images/hybrid-team.png"),
    _solution_card("Headset", "Customer support", "Agents cannot personally speak every customer language.", ["Long transfers", "Inconsistent service", "Limited coverage"], "Translate live conversations and direct chat while retaining speaker context.", "Broader support coverage and more natural service.", None),
    _solution_card("Landmark", "Government services", "Citizens can struggle to access services delivered in one official language.", ["Low accessibility", "Administrative delays", "Repeated visits"], "Provide translated consultations, instructions, and follow-up messages.", "More accessible public communication.", None),
    _solution_card("Plane", "Travel and tourism", "Visitors and local teams need quick communication without shared vocabulary.", ["Lost details", "Slow assistance", "Dependence on phrase apps"], "Enable live multilingual conversations from a mobile browser.", "More confident travel and faster help.", None),
    _solution_card("HandHeart", "NGOs and humanitarian work", "Field teams and communities often work across urgent language barriers.", ["Time pressure", "Limited interpreters", "High-stakes context"], "Combine spoken translation, captions, and lightweight meeting links.", "Faster coordination while preserving original statements.", None),
    _solution_card("Microscope", "Research collaboration", "International experts may understand the science but not every spoken nuance.", ["Missed questions", "Uneven discussion", "Manual transcript work"], "Translate seminars, working sessions, and written meeting chat.", "More equitable global research participation.", None),
    _solution_card("Users", "Remote teams", "Distributed teams communicate across languages, locations, and devices.", ["Meeting fatigue", "Language switching", "Disconnected tools"], "Keep video, translated voice, captions, and chat in one workspace.", "Fewer handoffs and more inclusive daily collaboration.", "/images/global-meeting.png"),
    _solution_card("Presentation", "Conferences", "A single stage language limits who can follow a session live.", ["Audience exclusion", "Separate caption tools", "Limited questions"], "Offer participant-language captions and translated meeting audio.", "A wider audience without duplicating sessions.", None),
    _solution_card("Scale", "Legal meetings", "Legal conversations require accurate attribution and preserved original meaning.", ["Terminology risk", "Speaker ambiguity", "Documentation pressure"], "Display original and translated transcripts with clear speaker identity.", "Better communication support while retaining source context.", None),
]


async def _seed_page(repo: CmsRepository, page_key: str, label: str, sections: list[dict]) -> None:
    if await repo.get_page(page_key):
        return
    await repo.create_page(page_key, label, MIGRATION_ACTOR)
    await repo.save_draft(page_key, sections, MIGRATION_ACTOR)
    await repo.publish(page_key, MIGRATION_ACTOR)


async def migrate_features_and_solutions(db: AsyncIOMotorDatabase) -> None:
    repo = CmsRepository(db)

    await _seed_page(repo, FEATURES_PAGE_KEY, FEATURES_PAGE_LABEL, [
        {
            "key": "sec_flagship", "type": "feature_grid", "name": "Flagship Features", "hidden": False,
            "eyebrow": "Flagship experiences", "title": "Translation stays inside the conversation",
            "body": "The product is designed around how people actually meet, not around a collection of disconnected AI tools.",
            "cards": FLAGSHIP_CARDS,
        },
        {
            "key": "sec_capabilities", "type": "feature_grid", "name": "Capability Catalog", "hidden": False,
            "eyebrow": "Complete capability catalog", "title": "The supporting system behind every meeting",
            "body": "Current, coming-soon, and future capabilities are labelled clearly.",
            "cards": CAPABILITY_CARDS,
        },
    ])

    await _seed_page(repo, SOLUTIONS_PAGE_KEY, SOLUTIONS_PAGE_LABEL, [
        {
            "key": "sec_solutions", "type": "solution_grid", "name": "Solutions by Industry", "hidden": False,
            "eyebrow": "Real-world impact", "title": "Start with the communication problem, not the technology",
            "body": "Each solution keeps the original speaker present while making the conversation accessible to more people.",
            "cards": SOLUTION_CARDS,
        },
    ])
