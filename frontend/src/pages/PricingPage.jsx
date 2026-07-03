import { Bell, Check, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { MarketingPage, PageHeader, SectionTitle } from "../components/marketing/MarketingPage";

export default function PricingPage() {
  return (
    <MarketingPage>
      <PageHeader eyebrow="Pricing" title="Simple plans are coming soon" description="Translation Bot is currently focused on validating meeting quality, language coverage, and cross-device reliability before introducing paid plans.">
        <Link className="button button--primary button--large" to="/signup">Try the current product</Link>
      </PageHeader>
      <section className="marketing-section">
        <div className="landing-shell">
          <SectionTitle centered eyebrow="Early access" title="Explore the platform while pricing takes shape" description="Future plans will be designed around meeting scale and language-service usage, not confusing feature gates." />
          <div className="pricing-preview">
            <span><Sparkles size={24} />Early access</span>
            <h2>Current product preview</h2>
            <p>Use authentication, rooms, translated chat, captions, voice translation, and audio/video meeting foundations.</p>
            <ul>{["Host and participant roles", "Shareable meeting links", "Live captions and multilingual chat", "Translated audio playback", "Connection diagnostics"].map((item) => <li key={item}><Check size={16} />{item}</li>)}</ul>
            <Link className="button button--primary button--large" to="/signup">Create account</Link>
          </div>
          <div className="pricing-note"><Bell size={20} /><p><strong>No payment details required.</strong> Pricing and production service limits will be published after reliability testing.</p></div>
        </div>
      </section>
    </MarketingPage>
  );
}
