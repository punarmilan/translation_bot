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
    description: "Participants speak naturally while translated captions, chat, and voice playback follow each listener's language preference.",
    benefits: ["Per-participant language routing", "Original audio preserved when languages match", "Speaker-aware output"],
    why: "Nobody has to become the room's unofficial interpreter.",
    use: "International planning, classes, and family calls.",
  },
  {
    icon: AudioLines,
    eyebrow: "AI voice translation",
    title: "Hear translated speech without leaving the meeting",
    description: "Spoken ideas become translated text and generated voice, queued automatically so clips remain understandable.",
    benefits: ["Automatic playback", "One result per target language", "Voice preference routing"],
    why: "Listening is more natural than monitoring a separate transcript window.",
    use: "Remote teams, multilingual consultations, and live events.",
  },
  {
    icon: MessageCircle,
    eyebrow: "Translated chat",
    title: "Write once. Let every recipient read naturally.",
    description: "Messages can reach everyone or one intended participant while preserving the room's host and participant rules.",
    benefits: ["Broadcast and direct messages", "Per-recipient translation", "Smart message delivery"],
    why: "Written collaboration should not require copying text into another tool.",
    use: "Meeting notes, links, private clarifications, and host announcements.",
  },
  {
    icon: Video,
    eyebrow: "Video conferencing",
    title: "Clear face-to-face meetings with familiar controls",
    description: "Join from a browser, see participants clearly, and control microphone and camera without interrupting translation.",
    benefits: ["Large responsive video tiles", "Mute and camera controls", "Stable peer-to-peer streams"],
    why: "Translation belongs inside the meeting, not beside a disconnected call product.",
    use: "Two-person meetings today, with a path toward larger hosted rooms.",
  },
];

const capabilities = [
  [Captions, "Live translated captions", "Original and translated text with speaker and detected-language context.", "Keeps every spoken idea visible.", "Interviews and lectures."],
  [Radio, "Voice conferencing", "Audio-first meetings for participants who do not need camera.", "Reduces bandwidth and distraction.", "Quick calls and low-bandwidth access."],
  [Users, "Role-based management", "Host, participant, and admin responsibilities remain distinct.", "Keeps room actions predictable.", "Classes and moderated meetings."],
  [Link2, "Meeting links", "Invite participants using a shareable room URL.", "Removes manual room setup.", "Scheduled and spontaneous meetings."],
  [Mic, "Speech recognition", "Spoken words become time-stamped text instantly.", "Creates the foundation for captions and translation.", "Any spoken meeting."],
  [Waypoints, "Translation pipeline", "Detected speech is translated only where languages differ.", "Avoids redundant translation overhead.", "Mixed-language rooms."],
  [Volume2, "Voice synthesis", "Translated text is converted into listener-language speech.", "Makes translated meetings easier to follow.", "Hands-free participation."],
  [RefreshCw, "Translation memory", "Repeated messages reuse cached results.", "Improves speed and responsiveness.", "Recurring instructions and phrases."],
  [Languages, "Language switching", "Change preferred language without creating a new account.", "Supports evolving meeting needs.", "Bilingual participants."],
  [MonitorSmartphone, "Cross-platform access", "Responsive meetings across modern desktop, tablet, and mobile browsers.", "Participants can join from any available device.", "Remote and field work."],
  [LockKeyhole, "Secure profile access", "Protected profiles and rooms with persistent user identity.", "Prevents anonymous room access.", "Private organizational meetings."],
  [BarChart3, "Meeting analytics", "Room activity, languages, and message counts are visible.", "Helps hosts understand participation.", "Operations and learning programs."],
  [ShieldCheck, "Moderator tools", "Manage user access and room parameters safely.", "Supports responsible platform operations.", "Internal administration."],
  [Waves, "Real-time communication", "Real-time peer audio and video stream delivery.", "Keeps communication responsive.", "Browser-to-browser meetings."],
  [CircleGauge, "Latency monitoring", "Pipeline timings are measured to track quality.", "Makes connection quality metrics transparent.", "Performance troubleshooting."],
  [SquareUserRound, "Participant status", "See connection, media, and translation state per participant.", "Reduces uncertainty during group calls.", "All meetings."],
  [Activity, "Diagnostics dashboard", "Inspect microphone, speaker, and camera health dynamically.", "Enables quick cross-device troubleshooting.", "Development and support."],
  [ScreenShare, "Screen sharing", "Present documents and applications inside meetings.", "Supports richer collaboration.", "Coming soon."],
  [ChartNoAxesCombined, "Meeting recording", "Capture meetings for approved playback and review.", "Preserves important sessions.", "Coming soon."],
  [Sparkles, "AI summaries", "Turn completed meetings into concise decisions and follow-ups.", "Reduces manual note taking.", "Coming soon."],
];

function CapabilityCard({ item }) {
  const [Icon, title, description, why, use] = item;
  return (
    <article className="capability-card">
      <span className="feature-icon"><Icon size={21} strokeWidth={1.7} /></span>
      <h3>{title}</h3>
      <p>{description}</p>
      <dl>
        <div><dt>Why it matters</dt><dd>{why}</dd></div>
        <div><dt>Use cases</dt><dd>{use}</dd></div>
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
                  <h2>{feature.title}</h2>
                  <p>{feature.description}</p>
                  <ul>{feature.benefits.map((benefit) => <li key={benefit}>{benefit}</li>)}</ul>
                  <dl>
                    <div><dt>Why it matters</dt><dd>{feature.why}</dd></div>
                    <div><dt>Use cases</dt><dd>{feature.use}</dd></div>
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
