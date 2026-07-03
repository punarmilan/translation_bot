import { BookOpen, FileCode2, LockKeyhole, ServerCog, Settings2, TestTube2 } from "lucide-react";
import { Link } from "react-router-dom";
import { MarketingPage, PageHeader, SectionTitle } from "../components/marketing/MarketingPage";

const guides = [
  [Settings2, "Local setup", "Install frontend and backend dependencies, configure environment variables, and start the supporting services."],
  [LockKeyhole, "HTTPS development", "Generate trusted local certificates so cameras and microphones work across LAN devices."],
  [ServerCog, "Backend services", "Configure MongoDB, translation, speech recognition, and voice synthesis services."],
  [FileCode2, "Websocket events", "Understand room membership, translated chat, signaling, speech events, and audio delivery."],
  [TestTube2, "Testing", "Run two-browser, cross-device, language-routing, and failure-recovery checks."],
  [BookOpen, "Troubleshooting", "Diagnose authentication, ICE connectivity, media permissions, translation failures, and TTS errors."],
];

export default function DocsPage() {
  return (
    <MarketingPage>
      <PageHeader eyebrow="Documentation" title="Build, run, test, and extend Translation Bot" description="Technical guidance for local development, meeting transport, language services, and production preparation.">
        <Link className="button button--primary button--large" to="/how-it-works">Architecture overview</Link>
        <Link className="button button--secondary button--large" to="/help">Troubleshooting</Link>
      </PageHeader>
      <section className="marketing-section">
        <div className="landing-shell docs-layout">
          <aside className="docs-sidebar">
            <strong>On this page</strong>
            {guides.map(([, title]) => <a key={title} href={`#${title.toLowerCase().replaceAll(" ", "-")}`}>{title}</a>)}
          </aside>
          <div className="docs-content">
            <SectionTitle eyebrow="Developer guides" title="Start with the workflow you need" />
            {guides.map(([Icon, title, text]) => (
              <article id={title.toLowerCase().replaceAll(" ", "-")} key={title}>
                <span className="feature-icon"><Icon size={22} /></span><div><h2>{title}</h2><p>{text}</p>
                <pre><code>{title === "Local setup" ? "docker compose up -d mongodb libretranslate\ncd backend\nuvicorn app.main:app --reload --host 0.0.0.0 --port 8000\n\ncd frontend\nnpm run dev" : `See docs/${title.toUpperCase().replaceAll(" ", "_")}.md`}</code></pre></div>
              </article>
            ))}
            <Link className="learn-more-link" to="/help">Open troubleshooting and support</Link>
          </div>
        </div>
      </section>
    </MarketingPage>
  );
}
