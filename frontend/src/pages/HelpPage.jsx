import { useMemo, useState } from "react";
import {
  BookOpen, Camera, Captions, CircleHelp, Headphones, Languages, LockKeyhole,
  MessageCircleWarning, Mic, Search, ShieldCheck, Video,
} from "lucide-react";
import { Link } from "react-router-dom";
import FAQ from "../components/landing/FAQ";
import { MarketingPage, PageHeader, SectionTitle } from "../components/marketing/MarketingPage";

const topics = [
  [BookOpen, "Quick start", "Create an account, choose your preferred language, enter a room name, and share the generated meeting link."],
  [Mic, "Microphone issues", "Use HTTPS, allow microphone access in the browser, confirm the correct input device, and close other apps using the microphone."],
  [Camera, "Camera issues", "Allow camera access, verify the selected device, reload after granting permission, and check that camera-off is not enabled."],
  [Captions, "Translation issues", "Confirm live translation is active, speak in complete sentences, and verify the selected listener language differs from the speaker language."],
  [Video, "Meeting issues", "Check websocket status, room spelling, authentication, and whether both participants joined the same room link."],
  [Headphones, "Audio issues", "Check system output volume, browser autoplay permissions, listener mode, mute state, and the translated-audio queue."],
  [CircleHelp, "Browser compatibility", "Use a current Chromium, Firefox, or Safari browser with HTTPS and WebRTC media support."],
  [Languages, "Supported languages", "The current interface includes English, Hindi, German, Spanish, French, Arabic, Dutch, Italian, Portuguese, and Russian."],
  [ShieldCheck, "Security", "Rooms require authenticated users and production media should use HTTPS, secure websockets, and managed secrets."],
  [LockKeyhole, "Privacy", "Microphone and camera permissions remain browser-controlled. Production policies should define recording, retention, and consent."],
];

export default function HelpPage() {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase();
    return value ? topics.filter(([, title, text]) => `${title} ${text}`.toLowerCase().includes(value)) : topics;
  }, [query]);

  return (
    <MarketingPage>
      <PageHeader eyebrow="Help Center" title="How can we help?" description="Find setup guidance, troubleshoot meetings, and understand languages, privacy, and browser requirements." />
      <section className="help-search-section">
        <div className="landing-shell">
          <label className="help-search">
            <Search size={21} aria-hidden="true" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search microphone, camera, translation..." />
          </label>
        </div>
      </section>
      <section className="marketing-section">
        <div className="landing-shell">
          <SectionTitle eyebrow="Support topics" title={query ? `Results for “${query}”` : "Start with a common task"} description={`${filtered.length} helpful ${filtered.length === 1 ? "article" : "articles"}`} />
          <div className="help-topic-grid">
            {filtered.map(([Icon, title, text]) => (
              <article key={title}><span className="feature-icon"><Icon size={21} /></span><h2>{title}</h2><p>{text}</p><Link to="/docs">Read documentation</Link></article>
            ))}
          </div>
          {filtered.length === 0 && <div className="help-empty"><MessageCircleWarning size={30} /><h2>No matching help article</h2><p>Try a broader search or review the documentation.</p></div>}
        </div>
      </section>
      <section className="marketing-section soft-section soft-section--lavender">
        <div className="landing-shell faq-layout">
          <SectionTitle eyebrow="Frequently asked questions" title="Answers before and during a meeting" />
          <FAQ />
        </div>
      </section>
      <section className="help-contact">
        <div className="landing-shell"><div><h2>Still need help?</h2><p>Review the technical setup guide or open the product and check the Diagnostics tab during a meeting.</p></div><Link className="button button--primary" to="/docs">Open documentation</Link></div>
      </section>
    </MarketingPage>
  );
}
