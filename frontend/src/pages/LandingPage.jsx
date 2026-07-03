import { Link } from "react-router-dom";
import {
  AudioLines,
  BriefcaseBusiness,
  Captions,
  GraduationCap,
  Headphones,
  Headset,
  HeartPulse,
  Languages,
  Landmark,
  Link2,
  MessageCircle,
  Mic,
  Plane,
  Presentation,
  RefreshCw,
  ShieldCheck,
  UserCheck,
  Users,
  Video,
  Volume2,
} from "lucide-react";
import ComparisonTable from "../components/landing/ComparisonTable";
import FAQ from "../components/landing/FAQ";
import FeatureCard from "../components/landing/FeatureCard";
import Footer from "../components/landing/Footer";
import HeroSection from "../components/landing/HeroSection";
import MetricCard from "../components/landing/MetricCard";
import Navbar from "../components/landing/Navbar";
import TestimonialCard from "../components/landing/TestimonialCard";
import Timeline from "../components/landing/Timeline";
import { useAuth } from "../contexts/AuthContext";

const miniFeatures = [
  [Languages, "Automatic language matching", "People who share a language hear the original conversation without unnecessary translation."],
  [Mic, "Natural meeting flow", "Speak in complete thoughts while the meeting handles captions and translation in the background."],
  [Headphones, "Personal listening choices", "Choose original audio, translated audio, captions, or a combination that suits you."],
  [ShieldCheck, "Host controls", "Create rooms, share meeting links, broadcast updates, and message participants directly."],
  [MessageCircle, "Private translated chat", "Send a direct message and let the recipient read it in their own language."],
  [UserCheck, "Clear speaker context", "Every caption and translated clip identifies who spoke and which languages are involved."],
  [RefreshCw, "Reliable reconnection", "Return to a room after a temporary connection interruption without rebuilding the meeting."],
  [Link2, "Works across devices", "Join from a modern desktop, tablet, or mobile browser using one shared link."],
];

const uses = [
  [GraduationCap, "Education", "Help students and educators understand lessons across languages."],
  [HeartPulse, "Healthcare", "Support clearer multilingual conversations with visible transcripts."],
  [BriefcaseBusiness, "International business", "Run project meetings without making one language the default."],
  [Users, "Remote teams", "Give distributed teams captions, chat, and translated speech."],
  [Headset, "Customer support", "Assist agents and customers with language-aware conversations."],
  [Landmark, "Government", "Make public collaboration more accessible across language groups."],
  [Plane, "Travel", "Connect guides, visitors, and local teams in real time."],
  [Presentation, "Conferences", "Extend sessions to multilingual audiences with live captions."],
];

const visualStories = [
  {
    image: "/images/global-meeting.png",
    icon: Languages,
    label: "Global meetings",
    title: "Speak once. Reach everyone.",
    text: "Each participant follows the same conversation in the language they prefer.",
    detail: "Hindi → English",
  },
  {
    image: "/images/online-classroom.png",
    icon: Captions,
    label: "Inclusive learning",
    title: "Lessons everyone can follow.",
    text: "Live captions keep international classrooms together, even when languages differ.",
    detail: "Captions live",
  },
  {
    image: "/images/hybrid-team.png",
    icon: MessageCircle,
    label: "Hybrid collaboration",
    title: "One team, without language silos.",
    text: "Video, translated chat, and voice stay in one focused meeting experience.",
    detail: "3 languages active",
  },
];

function VisualShowcase() {
  return (
    <section className="visual-showcase" aria-labelledby="visual-showcase-title">
      <div className="landing-shell">
        <header className="section-heading section-heading--center">
          <p className="section-eyebrow">Built for real conversations</p>
          <h2 id="visual-showcase-title">Wherever people meet, language should not get in the way</h2>
          <p>Translation Bot helps people stay present, expressive, and understood across meetings that matter.</p>
        </header>
        <div className="visual-story-grid">
          {visualStories.map(({ image, icon: Icon, label, title, text, detail }) => (
            <article key={title} className="visual-story-card">
              <img src={image} alt="" loading="lazy" decoding="async" />
              <div className="visual-story-card__scrim" />
              <div className="visual-story-card__status">
                <Icon size={15} strokeWidth={1.9} aria-hidden="true" />
                {detail}
              </div>
              <div className="visual-story-card__content">
                <span><Icon size={17} strokeWidth={1.8} aria-hidden="true" />{label}</span>
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function VoiceVisual() {
  return (
    <div className="voice-visual">
      <div className="waveform">{Array.from({ length: 18 }, (_, index) => <i key={index} />)}</div>
      <div className="language-route"><span>HI</span><b>Translating</b><span>EN</span></div>
      <div className="caption-sample"><small>Original</small><p>हम आज योजना पर बात करेंगे।</p></div>
      <div className="caption-sample caption-sample--accent"><small>English voice</small><p>We’ll discuss the plan today.</p></div>
    </div>
  );
}

function VideoVisual() {
  return (
    <div className="video-visual">
      {["Aarav · HI", "Maria · ES", "Noor · EN", "Julien · FR"].map((name, index) => (
        <div key={name} className={index === 0 ? "is-speaking" : ""}>
          <span>{name[0]}</span><small>{name}</small>
        </div>
      ))}
      <p><i className="status-dot" /> Peer connection stable</p>
    </div>
  );
}

function ChatVisual() {
  return (
    <div className="chat-visual">
      <div><small>Maria · Spanish</small><p>¿Podemos empezar?</p><span>Can we begin?</span></div>
      <div><small>Noor · English</small><p>Yes, the team is ready.</p><span>Sí, el equipo está listo.</span></div>
      <div className="chat-visual__typing"><i /><i /><i /></div>
    </div>
  );
}

function CaptionVisual() {
  return (
    <div className="caption-visual">
      <span className="caption-visual__live">Live captions</span>
      <p>Every participant can follow the conversation in the language they understand best.</p>
      <div><span>STT 740 ms</span><span>Translation 210 ms</span><span>Detected EN</span></div>
    </div>
  );
}

function ExperienceDiagram() {
  const nodes = [
    ["1", "You speak naturally"],
    ["2", "The meeting understands"],
    ["3", "Each person receives their language"],
    ["4", "Everyone replies normally"],
  ];
  return (
    <div className="architecture-diagram experience-diagram">
      {nodes.map(([number, label]) => (
        <div key={number} className="architecture-node">
          <span>{number.padStart(2, "0")}</span><strong>{label}</strong>
        </div>
      ))}
    </div>
  );
}

export default function LandingPage() {
  const { user } = useAuth();

  return (
    <div className="landing-page">
      <Navbar user={user} />
      <main>
        <HeroSection user={user} />

        <section className="trust-section section-band">
          <div className="landing-shell">
            <p className="section-eyebrow section-eyebrow--center">One conversation. Everyone included.</p>
            <ul className="technology-list outcome-list">
              {["Translated voice", "Live captions", "Language-aware chat", "Shareable meetings", "Personal preferences"].map((name) => (
                <li key={name} className="technology-badge"><span aria-hidden="true">✓</span>{name}</li>
              ))}
            </ul>
          </div>
        </section>

        <VisualShowcase />

        <section id="features" className="landing-section">
          <div className="landing-shell">
            <header className="section-heading">
              <p className="section-eyebrow">One meeting. Many languages.</p>
              <h2>Meet without asking anyone to switch languages</h2>
              <p>Video, translated voice, live captions, and multilingual chat stay together in one simple meeting.</p>
            </header>
            <div className="feature-stories">
              <FeatureCard
                icon={AudioLines}
                eyebrow="Real-time voice translation"
                title="Hear the meeting in the language you understand"
                description="Speak normally while each listener follows the conversation using their own language preference."
                benefits={["Automatic translated playback", "No translation when languages already match", "Audio plays in order without overlapping"]}
                example="A Hindi speaker talks naturally while an English listener receives English captions and generated audio."
                visual={<VoiceVisual />}
              />
              <FeatureCard
                icon={Video}
                reverse
                eyebrow="Face-to-face meetings"
                title="See the people behind every conversation"
                description="Bring people together with clear video, simple meeting links, and familiar camera and microphone controls."
                benefits={["Clear participant video", "One-click mute and camera controls", "Easy reconnection when a network changes"]}
                example="A host and participant join from separate devices and keep chat and translation active alongside video."
                visual={<VideoVisual />}
              />
              <FeatureCard
                icon={Captions}
                eyebrow="Live AI captions"
                title="Make every spoken idea visible"
                description="Read what each person says in real time, with the speaker and language clearly identified."
                benefits={["Original and translated text", "Speaker names on every caption", "Language shown automatically"]}
                example="A recruiter follows a multilingual interview with the original transcript and an English translation side by side."
                visual={<CaptionVisual />}
              />
              <FeatureCard
                icon={MessageCircle}
                reverse
                eyebrow="Multilingual chat"
                title="Write once, deliver in every participant’s language"
                description="Chat with everyone or message one participant privately. Each recipient reads the message in their preferred language."
                benefits={["Send to everyone", "Private participant messages", "Automatic translation for every recipient"]}
                example="A host sends one announcement and every participant receives a localized version."
                visual={<ChatVisual />}
              />
            </div>
          </div>
        </section>

        <section className="landing-section section-band soft-section soft-section--blue">
          <div className="landing-shell">
            <header className="section-heading section-heading--compact">
              <p className="section-eyebrow">Designed around people</p>
              <h2>Everything needed for a comfortable multilingual meeting</h2>
            </header>
            <div className="mini-feature-grid">
              {miniFeatures.map(([Icon, title, text]) => (
                <article key={title}><span className="feature-icon"><Icon size={20} strokeWidth={1.7} aria-hidden="true" /></span><h3>{title}</h3><p>{text}</p></article>
              ))}
            </div>
          </div>
        </section>

        <section id="demo" className="landing-section">
          <div className="landing-shell split-heading">
            <header className="section-heading">
              <p className="section-eyebrow">How it works</p>
              <h2>Join, choose your language, and start talking</h2>
              <p>Translation stays in the background so the meeting still feels like a normal conversation.</p>
            </header>
            <Timeline />
          </div>
        </section>

        <section id="experience" className="landing-section architecture-section section-band soft-section soft-section--mint">
          <div className="landing-shell">
            <header className="section-heading section-heading--center">
              <p className="section-eyebrow">A meeting that adapts to you</p>
              <h2>One speaker can be understood in many languages</h2>
              <p>Everyone chooses how they want to listen and read. The conversation stays shared, while the experience becomes personal.</p>
            </header>
            <ExperienceDiagram />
            <div className="architecture-actions">
              <Link className="button button--secondary" to="/how-it-works">See how it works</Link>
              <Link className="button button--quiet" to={user ? "/chat" : "/signup"}>Open the product</Link>
            </div>
          </div>
        </section>

        <section id="comparison" className="landing-section">
          <div className="landing-shell">
            <header className="section-heading">
              <p className="section-eyebrow">Why Translation Bot</p>
              <h2>Language support is part of the meeting, not an add-on</h2>
            </header>
            <ComparisonTable />
          </div>
        </section>

        <section id="solutions" className="landing-section section-band soft-section soft-section--peach">
          <div className="landing-shell">
            <header className="section-heading section-heading--compact">
              <p className="section-eyebrow">Solutions</p>
              <h2>Useful wherever language slows collaboration</h2>
            </header>
            <div className="use-case-grid">
              {uses.map(([Icon, title, text]) => (
                <article key={title}><span className="feature-icon"><Icon size={20} strokeWidth={1.7} aria-hidden="true" /></span><h3>{title}</h3><p>{text}</p></article>
              ))}
            </div>
          </div>
        </section>

        <section id="roadmap" className="landing-section">
          <div className="landing-shell">
            <header className="section-heading section-heading--center">
              <p className="section-eyebrow">Made for real conversations</p>
              <h2>Useful choices, visible when you need them</h2>
              <p>Every feature is focused on helping people understand one another without interrupting the meeting.</p>
            </header>
            <div className="metrics-grid">
              <MetricCard icon={Languages} value="10+" label="Language choices" detail="Choose the language you prefer across your profile and meetings." />
              <MetricCard icon={Captions} value="Live" label="Translated captions" detail="Follow the conversation while participants are speaking." />
              <MetricCard icon={Headphones} value="Personal" label="Listening mode" detail="Choose original audio, translated audio, or captions." />
              <MetricCard icon={MessageCircle} value="Direct" label="Private messages" detail="Send translated messages to a specific participant." />
              <MetricCard icon={Link2} value="One link" label="Meeting invites" detail="Share a room link with authenticated participants." />
              <MetricCard icon={Volume2} value="Automatic" label="Audio playback" detail="Translated speech is queued and played without manual clicks." />
            </div>
          </div>
        </section>

        <section className="landing-section section-band soft-section soft-section--lavender">
          <div className="landing-shell">
            <header className="section-heading section-heading--compact">
              <p className="section-eyebrow">Product scenarios</p>
              <h2>How teams could use Translation Bot</h2>
              <p>These examples are clearly labelled demo content and are not presented as customer endorsements.</p>
            </header>
            <div className="testimonial-grid">
              <TestimonialCard initials="DE" name="Demo educator" role="International classroom" quote="Students can follow the original speaker while reading the same idea in their preferred language." />
              <TestimonialCard initials="DT" name="Demo team lead" role="Distributed product team" quote="Captions, chat, and voice translation stay in the same meeting instead of becoming separate tools." />
              <TestimonialCard initials="DS" name="Demo support lead" role="Multilingual customer support" quote="Language-aware routing makes it easier to serve customers without losing the original context." />
            </div>
          </div>
        </section>

        <section id="faq" className="landing-section">
          <div className="landing-shell faq-layout">
            <header className="section-heading">
              <p className="section-eyebrow">FAQ</p>
              <h2>Questions before your first meeting</h2>
              <p>Practical answers about languages, invitations, messaging, and device support.</p>
            </header>
            <FAQ />
          </div>
        </section>

        <section id="pricing" className="cta-section">
          <div className="landing-shell cta-section__inner">
            <div>
              <p className="section-eyebrow">Pricing coming soon</p>
              <h2>Ready to Remove Language Barriers?</h2>
              <p>Start your first meeting today and let everyone participate in the language they know best.</p>
            </div>
            <div>
              <Link to={user ? "/chat" : "/signup"} className="button button--primary button--large">Launch app</Link>
              <Link to="/how-it-works" className="button button--secondary button--large">See how it works</Link>
            </div>
          </div>
        </section>
      </main>
      <Footer user={user} />
    </div>
  );
}
