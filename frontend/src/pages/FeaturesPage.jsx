import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getPublicContent } from "../services/api";
import {
  Activity, AudioLines, BarChart3, Captions, ChartNoAxesCombined, CircleGauge,
  Languages, Link2, LockKeyhole, MessageCircle, Mic, MonitorSmartphone,
  Radio, RefreshCw, ScreenShare, ShieldCheck, Sparkles, SquareUserRound,
  Users, Video, Volume2, Waves, Waypoints,
} from "lucide-react";
import { CTASection, MarketingPage, PageHeader, ProductMockup, SectionTitle } from "../components/marketing/MarketingPage";

const flagship = [
  {
    icon: Languages,
    eyebrow: "Multilingual meetings",
    title: "One conversation, personalized for every listener",
    description: "Participants speak naturally while translated captions, chat, and available voice playback follow each listener's language preference.",
    benefits: ["Per-participant language routing", "Original audio preserved when languages match", "Speaker-aware translated output"],
    implementation: "Room sessions carry language and listener preferences through the existing real-time transport.",
    why: "Nobody has to become the room's unofficial interpreter.",
    use: "International planning, interviews, classes, and customer calls.",
    performance: "Translation and playback latency are measured for every transcript.",
  },
  {
    icon: AudioLines,
    eyebrow: "AI voice translation",
    title: "Hear translated speech without leaving the meeting",
    description: "Spoken ideas become translated text and generated voice, queued automatically so clips remain understandable.",
    benefits: ["Automatic playback", "One result per target language", "Voice preference routing"],
    implementation: "Continuous microphone segments move through speech recognition, translation, synthesis, and recipient delivery.",
    why: "Listening is more natural than monitoring a separate transcript window.",
    use: "Remote teams, multilingual consultations, and live events.",
    performance: "STT, translation, synthesis, and end-to-end timing remain visible.",
  },
  {
    icon: MessageCircle,
    eyebrow: "Translated chat",
    title: "Write once. Let every recipient read naturally.",
    description: "Messages can reach everyone or one intended participant while preserving the room's host and participant rules.",
    benefits: ["Broadcast and direct messages", "Per-recipient translation", "Repeated-message caching"],
    implementation: "Websocket messages carry delivery mode and target session IDs before language-aware routing.",
    why: "Written collaboration should not require copying text into another tool.",
    use: "Meeting notes, links, private clarifications, and host announcements.",
    performance: "Slow recipients use independent outbound queues and do not block broadcasts.",
  },
  {
    icon: Video,
    eyebrow: "Video conferencing",
    title: "Clear face-to-face meetings with familiar controls",
    description: "Join from a browser, see participants clearly, and control microphone and camera without interrupting translation.",
    benefits: ["Large responsive video tiles", "Mute and camera controls", "Reconnect-aware signaling"],
    implementation: "Peer media uses targeted offer, answer, and ICE exchange over the existing room websocket.",
    why: "Translation belongs inside the meeting, not beside a disconnected call product.",
    use: "Two-person meetings today, with a path toward larger hosted rooms.",
    performance: "Connection, ICE, local stream, and remote stream states are observable.",
  },
];

const capabilities = [
  [Captions, "Live translated captions", "Original and translated text with speaker and detected-language context.", "Streaming transcripts are routed per language.", "Keeps every spoken idea visible.", "Interviews and lectures.", "Per-transcript latency."],
  [Radio, "Voice conferencing", "Audio-first meetings for participants who do not need camera.", "Audio tracks reuse room signaling.", "Reduces bandwidth and distraction.", "Quick calls and low-bandwidth access.", "Connection diagnostics."],
  [Users, "Role-based management", "Host, participant, and admin responsibilities remain distinct.", "Roles are persisted with authenticated profiles.", "Keeps room actions predictable.", "Classes and moderated meetings.", "Constant-time authorization checks."],
  [Link2, "Meeting links", "Invite authenticated participants using a shareable room URL.", "Room IDs are encoded into the join route.", "Removes manual room setup.", "Scheduled and spontaneous meetings.", "Instant link generation."],
  [Mic, "Speech recognition", "Multilingual speech becomes time-stamped text.", "Faster-Whisper runs behind a modular STT interface.", "Creates the foundation for captions and translation.", "Any spoken meeting.", "Model and hardware dependent."],
  [Waypoints, "Translation pipeline", "Detected speech is translated only where languages differ.", "A provider abstraction handles translation and fallback.", "Avoids redundant work.", "Mixed-language rooms.", "Cache-assisted repeated text."],
  [Volume2, "Natural voice synthesis", "Translated text is converted into listener-language speech.", "Voice routing selects available language and preference models.", "Makes translated meetings easier to follow.", "Hands-free participation.", "Synthesis latency is tracked."],
  [RefreshCw, "Translation memory", "Repeated messages reuse cached results.", "Cache keys include text, source, and target language.", "Improves speed and reduces service calls.", "Recurring instructions and phrases.", "Near-instant cache hits."],
  [Languages, "Language switching", "Change preferred language without creating a new account.", "Profile and live room preference updates stay synchronized.", "Supports evolving meeting needs.", "Bilingual participants.", "Immediate room update."],
  [MonitorSmartphone, "Cross-platform access", "Responsive meetings across modern desktop, tablet, and mobile browsers.", "Standards-based media and responsive React layouts.", "Participants can join from available devices.", "Remote and field work.", "HTTPS required for media."],
  [LockKeyhole, "Secure authentication", "Protected profiles and rooms with persistent user identity.", "JWT validation and MongoDB-backed accounts.", "Prevents anonymous room access.", "Private organizational meetings.", "Indexed account lookup."],
  [BarChart3, "Meeting analytics", "Room activity, languages, and message counts are visible.", "Room statistics aggregate active session state.", "Helps hosts understand participation.", "Operations and learning programs.", "Live in-memory statistics."],
  [ShieldCheck, "Admin dashboard foundation", "Admin users can inspect user and preference distributions.", "Role-protected endpoints expose aggregate data.", "Supports responsible platform operations.", "Internal administration.", "Database aggregation."],
  [Waves, "WebRTC engine", "Real-time peer audio and video with session-targeted signaling.", "RTCPeerConnection uses STUN and websocket relay.", "Keeps media responsive.", "Browser-to-browser meetings.", "Network-dependent latency."],
  [CircleGauge, "Latency monitoring", "STT, translation, TTS, and end-to-end timing are displayed.", "Every pipeline stage records structured timing.", "Makes quality measurable.", "Performance testing.", "Millisecond reporting."],
  [SquareUserRound, "Participant status", "See connection, media, and translation state per participant.", "Room membership and translation events update live UI state.", "Reduces uncertainty during calls.", "All meetings.", "Event-driven updates."],
  [Activity, "Connection diagnostics", "Inspect websocket, ICE, peer, and stream health.", "Structured client state is grouped in a diagnostics panel.", "Speeds up cross-device troubleshooting.", "Development and support.", "Live state reporting."],
  [ScreenShare, "Screen sharing", "Present documents and applications inside meetings.", "Planned media-track extension.", "Supports richer collaboration.", "Demos and teaching.", "Coming soon."],
  [ChartNoAxesCombined, "Meeting recording", "Capture meetings for approved playback and review.", "Planned consent-aware recording service.", "Preserves important sessions.", "Training and research.", "Coming soon."],
  [Sparkles, "AI summaries", "Turn completed meetings into concise decisions and follow-ups.", "Future transcript summarization layer.", "Reduces manual note taking.", "Project and customer meetings.", "Future milestone."],
];

function CapabilityCard({ item }) {
  const [Icon, title, description, implementation, why, use, performance] = item;
  return (
    <article className="capability-card">
      <span className="feature-icon"><Icon size={21} strokeWidth={1.7} /></span>
      <h3>{title}</h3><p>{description}</p>
      <dl>
        <div><dt>How it works</dt><dd>{implementation}</dd></div>
        <div><dt>Why it matters</dt><dd>{why}</dd></div>
        <div><dt>Use cases</dt><dd>{use}</dd></div>
        <div><dt>Performance</dt><dd>{performance}</dd></div>
      </dl>
    </article>
  );
}

export default function FeaturesPage() {
  const [content, setContent] = useState(null);

  useEffect(() => {
    getPublicContent()
      .then((res) => {
        const item = res.items.find((x) => x.key === "features.page");
        if (item) setContent(item.content);
      })
      .catch((err) => console.warn("Failed to load features page content", err));
  }, []);

  const title = content?.title || "Meet, speak, and collaborate across languages";
  const body = content?.body || "A complete meeting experience where video, speech, captions, chat, roles, and diagnostics work together.";

  return (
    <MarketingPage>
      <PageHeader eyebrow="Product features" title={title} description={body}>
        <Link className="button button--primary button--large" to="/signup">Get started</Link>
        <Link className="button button--secondary button--large" to="/how-it-works">See how it works</Link>
      </PageHeader>

      <section className="marketing-section">
        <div className="landing-shell">
          <SectionTitle eyebrow="Flagship experiences" title="Translation stays inside the conversation" description="The product is designed around how people actually meet, not around a collection of disconnected AI tools." />
          <div className="flagship-list">
            {flagship.map((feature, index) => (
              <article className={`flagship-feature ${index % 2 ? "is-reverse" : ""}`} key={feature.title}>
                <div className="flagship-feature__copy">
                  <p className="section-eyebrow"><feature.icon size={16} />{feature.eyebrow}</p>
                  <h2>{feature.title}</h2><p>{feature.description}</p>
                  <ul>{feature.benefits.map((benefit) => <li key={benefit}>{benefit}</li>)}</ul>
                  <dl>
                    <div><dt>Technical implementation</dt><dd>{feature.implementation}</dd></div>
                    <div><dt>Why it matters</dt><dd>{feature.why}</dd></div>
                    <div><dt>Use cases</dt><dd>{feature.use}</dd></div>
                    <div><dt>Performance</dt><dd>{feature.performance}</dd></div>
                  </dl>
                </div>
                <ProductMockup icon={feature.icon} title={feature.eyebrow} status={index === 1 ? "842 ms" : "Live"} />
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="marketing-section soft-section soft-section--blue">
        <div className="landing-shell">
          <SectionTitle eyebrow="Complete capability catalog" title="The supporting system behind every meeting" description="Current, coming-soon, and future capabilities are labelled clearly." />
          <div className="capability-grid">{capabilities.map((item) => <CapabilityCard key={item[1]} item={item} />)}</div>
        </div>
      </section>
      <CTASection />
    </MarketingPage>
  );
}
