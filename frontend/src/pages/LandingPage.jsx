import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getPublicContent } from "../services/api";
import {
  AudioLines,
  BriefcaseBusiness,
  Captions,
  Languages,
  Link2,
  MessageCircle,
  Presentation,
  ShieldCheck,
  Sparkles,
  UserCheck,
  Video,
} from "lucide-react";
import FAQ from "../components/landing/FAQ";
import Footer from "../components/landing/Footer";
import HeroSection from "../components/landing/HeroSection";
import Navbar from "../components/landing/Navbar";
import TestimonialsSection from "../components/landing/TestimonialsSection";
import { useAuth } from "../contexts/AuthContext";

const row1 = [
  { title: "Live Translation", desc: "Translate text conversations instantaneously.", image: "/images/translation_feature.png", icon: Languages },
  { title: "AI Meeting Notes", desc: "Automated takeaway summaries.", image: "/images/notes_feature.png", icon: Sparkles },
  { title: "Whiteboard", desc: "Interactive shared drawing canvas.", image: "/images/whiteboard_feature.png", icon: Presentation },
  { title: "File Sharing", desc: "Send documents inside rooms.", image: "/images/global-meeting.png", icon: Link2 },
  { title: "Meeting Recording", desc: "Record meetings for replay.", image: "/images/hybrid-team.png", icon: Video },
  { title: "Translation Chat", desc: "Multilingual chat rooms.", image: "/images/translation_feature.png", icon: MessageCircle },
  { title: "AI Insights", desc: "Topics and action items extraction.", image: "/images/online-classroom.png", icon: Sparkles },
];

const row2 = [
  { title: "Voice Translation", desc: "Real-time speech-to-speech.", image: "/images/translation_feature.png", icon: AudioLines },
  { title: "Live Captions", desc: "Floating custom captions overlay.", image: "/images/online-classroom.png", icon: Captions },
  { title: "Shared Notes", desc: "Collaborative notepad document.", image: "/images/notes_feature.png", icon: BriefcaseBusiness },
  { title: "Screen Sharing", desc: "Present your screen to all peers.", image: "/images/hybrid-team.png", icon: Presentation },
  { title: "Admin Dashboard", desc: "Tenant organization controls.", image: "/images/dashboard_feature.png", icon: ShieldCheck },
  { title: "Multiple Languages", desc: "10+ dynamic localized languages.", image: "/images/global-meeting.png", icon: Languages },
  { title: "Speaker Diarization", desc: "Speaker attribution indexes.", image: "/images/online-classroom.png", icon: UserCheck },
];

function MarqueeCard({ title, desc, icon: Icon, image }) {
  return (
    <article className="marquee-card">
      <div className="marquee-card__visual">
        {image ? (
          <img src={image} alt={title} className="marquee-card__img" loading="lazy" />
        ) : (
          <Icon className="marquee-card__icon" strokeWidth={1.5} />
        )}
        <div className="marquee-card__glow" />
      </div>
      <h3>{title}</h3>
      <p>{desc}</p>
    </article>
  );
}

function DynamicShowcase() {
  return (
    <section className="marquee-showcase-section py-16">
      <div className="landing-shell">
        <header className="section-heading section-heading--center">
          <p className="section-eyebrow">Built for real-time collaboration</p>
          <h2>Powering multilingual meetings anywhere</h2>
          <p>Every tool is designed to work fully offline on local setups, preserving security and privacy.</p>
        </header>
      </div>

      <div className="marquee-container">
        <div className="marquee-row marquee-row--left">
          {[...row1, ...row1, ...row1].map((item, idx) => (
            <MarqueeCard key={`r1-${idx}`} {...item} />
          ))}
        </div>

        <div className="marquee-row marquee-row--right">
          {[...row2, ...row2, ...row2].map((item, idx) => (
            <MarqueeCard key={`r2-${idx}`} {...item} />
          ))}
        </div>
      </div>
    </section>
  );
}

function CoreBenefits() {
  return (
    <section id="benefits" className="landing-section benefits-section">
      <div className="landing-shell">
        <header className="section-heading section-heading--center">
          <p className="section-eyebrow">Why VOXO</p>
          <h2>Meetings designed around human connection</h2>
        </header>

        <div className="benefits-grid">
          <div className="benefit-card">
            <div className="benefit-icon">🗣️</div>
            <h3>Speak Naturally</h3>
            <p>No need to switch languages manually. Talk naturally, and VOXO translates your voice, captions, and chat into the native language of each participant.</p>
          </div>
          <div className="benefit-card">
            <div className="benefit-icon">🤝</div>
            <h3>Collaborate Seamlessly</h3>
            <p>Access the whiteboard, shared notes, file library, and diagnostics directly in the call stage without interrupting video audio.</p>
          </div>
          <div className="benefit-card">
            <div className="benefit-icon">🔒</div>
            <h3>Self-Hosted & Private</h3>
            <p>Enjoy 100% offline, self-hosted deployment. Your voice data and meeting records never leave your local infrastructure or cross third-party clouds.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function LandingPage() {
  const { user } = useAuth();
  const [content, setContent] = useState({});

  useEffect(() => {
    getPublicContent()
      .then((res) => {
        const mapped = {};
        res.items.forEach((item) => {
          mapped[item.key] = item.content;
        });
        setContent(mapped);
      })
      .catch((err) => console.warn("Failed to load public CMS content", err));
  }, []);

  return (
    <div className="landing-page bg-brand-dark min-h-screen">
      <Navbar user={user} />
      <main>
        <HeroSection user={user} cms={content["landing.hero"]} />

        {/* Task 8: Move CoreBenefits ("Meetings designed around human connection") ABOVE DynamicShowcase */}
        <CoreBenefits />

        <DynamicShowcase />

        {/* Task 9: Premium Testimonials Section */}
        <TestimonialsSection />

        <section id="faq" className="landing-section">
          <div className="landing-shell faq-layout">
            <header className="section-heading">
              <p className="section-eyebrow">FAQ</p>
              <h2>Questions before your first meeting</h2>
              <p>Practical answers about languages, invitations, messaging, and device support.</p>
            </header>
            <FAQ cms={content["site.faqs"]} />
          </div>
        </section>

        <section className="cta-section">
          <div className="landing-shell cta-section__inner">
            <div>
              <p className="section-eyebrow">Ready to start?</p>
              <h2>Ready to Remove Language Barriers with VOXO?</h2>
              <p>Start your first meeting today and let everyone participate in the language they know best.</p>
            </div>
            <div>
              <Link to={user ? "/chat" : "/signup"} className="button button--primary button--large">
                Launch Workspace
              </Link>
              <Link to="/how-it-works" className="button button--secondary button--large">
                See How It Works
              </Link>
            </div>
          </div>
        </section>
      </main>
      <Footer user={user} cms={content["site.footer"]} />
    </div>
  );
}
