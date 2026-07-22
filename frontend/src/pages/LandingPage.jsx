import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getPublicContent, resolveImageUrl } from "../services/api";
import { useConfig } from "../contexts/ConfigContext";
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

function MarqueeCard({ title, desc, description, icon: Icon, image, image_url, icon }) {
  const displayTitle = title;
  const displayDesc = description || desc;
  const displayImage = resolveImageUrl(image_url || image);

  return (
    <article className="marquee-card">
      <div className="marquee-card__visual">
        {displayImage ? (
          <img src={displayImage} alt={displayTitle || "Feature"} className="marquee-card__img" loading="lazy" />
        ) : Icon && (typeof Icon === "function" || typeof Icon === "object") ? (
          <Icon className="marquee-card__icon" strokeWidth={1.5} />
        ) : (
          <span style={{ fontSize: "28px" }}>{icon || "✨"}</span>
        )}
        <div className="marquee-card__glow" />
      </div>
      <h3>{displayTitle}</h3>
      <p>{displayDesc}</p>
    </article>
  );
}

function DynamicShowcase({ data }) {
  const eyebrow = data?.eyebrow || "Built for real-time collaboration";
  const title = data?.title || "Powering multilingual meetings anywhere";
  const body = data?.body || "Every tool is designed to work fully offline on local setups, preserving security and privacy.";

  const allCards = data?.cards && data.cards.length > 0 ? data.cards : [...row1, ...row2];
  const mid = Math.ceil(allCards.length / 2);
  const row1Cards = allCards.slice(0, mid);
  const row2Cards = allCards.slice(mid);

  return (
    <section className="marquee-showcase-section py-16">
      <div className="landing-shell">
        <header className="section-heading section-heading--center">
          <p className="section-eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
          <p>{body}</p>
        </header>
      </div>

      <div className="marquee-container">
        <div className="marquee-row marquee-row--left">
          {[...row1Cards, ...row1Cards, ...row1Cards].map((item, idx) => (
            <MarqueeCard key={`r1-${idx}`} {...item} />
          ))}
        </div>

        <div className="marquee-row marquee-row--right">
          {[...row2Cards, ...row2Cards, ...row2Cards].map((item, idx) => (
            <MarqueeCard key={`r2-${idx}`} {...item} />
          ))}
        </div>
      </div>
    </section>
  );
}

function CoreBenefits({ data }) {
  const eyebrow = data?.eyebrow || "Why VOXO";
  const title = data?.title || "Meetings designed around human connection";
  const body = data?.body || "Speak naturally, collaborate seamlessly, and keep voice data self-hosted.";
  const customCards = data?.cards && data.cards.length > 0 ? data.cards : null;

  return (
    <section id="benefits" className="landing-section benefits-section">
      <div className="landing-shell">
        <header className="section-heading section-heading--center">
          <p className="section-eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
          {body && <p style={{ color: "var(--muted)", fontSize: "14px", marginTop: "8px" }}>{body}</p>}
        </header>

        <div className="benefits-grid">
          {customCards ? (
            customCards.map((card, idx) => (
              <div key={card.id || idx} className="benefit-card">
                <div className="benefit-icon">{card.icon || "🗣️"}</div>
                <h3>{card.title}</h3>
                <p>{card.description}</p>
              </div>
            ))
          ) : (
            <>
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
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function CustomSectionBlock({ data }) {
  if (data.hidden) return null;
  return (
    <section className="landing-section py-16 border-t border-white/10">
      <div className="landing-shell">
        <header className="section-heading section-heading--center">
          {data.eyebrow && <p className="section-eyebrow">{data.eyebrow}</p>}
          <h2>{data.title}</h2>
          {data.body && <p style={{ color: "var(--muted)", fontSize: "14px", marginTop: "8px" }}>{data.body}</p>}
        </header>

        {data.cards && data.cards.length > 0 && (
          <div className="grid md:grid-cols-3 gap-6 max-w-6xl mx-auto px-4 mt-8">
            {data.cards.map((card, idx) => (
              <div key={card.id || idx} className="p-6 rounded-2xl bg-white/[0.03] border border-white/10 flex flex-col justify-between">
                <div>
                  {card.image_url ? (
                    <img src={resolveImageUrl(card.image_url)} alt={card.title} className="w-full h-40 object-cover rounded-xl mb-4" />
                  ) : (
                    <div className="text-3xl mb-3">{card.icon || "✨"}</div>
                  )}
                  <h3 className="text-lg font-bold text-brand-bg mb-2">{card.title}</h3>
                  <p className="text-xs text-ui-muted">{card.description}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export default function LandingPage() {
  const { user } = useAuth();
  const { sections, branding } = useConfig();
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

  const activeSections = sections && sections.length > 0
    ? sections.filter((s) => !s.hidden)
    : [
        { type: "hero", id: "sec_hero" },
        { type: "benefits", id: "sec_benefits" },
        { type: "showcase", id: "sec_showcase" },
        { type: "testimonials", id: "sec_testimonials" },
        { type: "faq", id: "sec_faq" },
        { type: "cta", id: "sec_cta" },
      ];

  return (
    <div className="landing-page bg-brand-dark min-h-screen">
      <Navbar user={user} />
      <main>
        {activeSections.map((sec, idx) => {
          const sType = sec.type || sec.id;
          if (sType === "hero" || sec.id === "sec_hero") {
            return (
              <HeroSection
                key={sec.id || idx}
                user={user}
                cms={{
                  ...(content["landing.hero"] || {}),
                  eyebrow: sec.eyebrow || content["landing.hero"]?.eyebrow,
                  title: sec.title || content["landing.hero"]?.title,
                  body: sec.body || content["landing.hero"]?.body,
                  cta_text: sec.cta_text,
                  cta_link: sec.cta_link,
                }}
              />
            );
          }
          if (sType === "benefits" || sec.id === "sec_benefits") {
            return <CoreBenefits key={sec.id || idx} data={sec} />;
          }
          if (sType === "showcase" || sec.id === "sec_showcase") {
            return <DynamicShowcase key={sec.id || idx} data={sec} />;
          }
          if (sType === "testimonials" || sec.id === "sec_testimonials") {
            return <TestimonialsSection key={sec.id || idx} data={sec} />;
          }
          if (sType === "faq" || sec.id === "sec_faq") {
            return (
              <section key={sec.id || idx} id="faq" className="landing-section">
                <div className="landing-shell faq-layout">
                  <header className="section-heading">
                    <p className="section-eyebrow">{sec.eyebrow || "FAQ"}</p>
                    <h2>{sec.title || "Questions before your first meeting"}</h2>
                    <p>{sec.body || "Practical answers about languages, invitations, messaging, and device support."}</p>
                  </header>
                  <FAQ cms={content["site.faqs"]} customCards={sec.cards} />
                </div>
              </section>
            );
          }
          if (sType === "cta" || sec.id === "sec_cta") {
            return (
              <section key={sec.id || idx} className="cta-section">
                <div className="landing-shell cta-section__inner">
                  <div>
                    <p className="section-eyebrow">{sec.eyebrow || "Ready to start?"}</p>
                    <h2>{sec.title || "Ready to Remove Language Barriers with VOXO?"}</h2>
                    <p>{sec.body || "Start your first meeting today and let everyone participate in the language they know best."}</p>
                  </div>
                  <div>
                    <Link to={user ? "/chat" : "/signup"} className="button button--primary button--large">
                      {sec.cta_text || "Launch Workspace"}
                    </Link>
                    <Link to="/how-it-works" className="button button--secondary button--large">
                      See How It Works
                    </Link>
                  </div>
                </div>
              </section>
            );
          }
          return <CustomSectionBlock key={sec.id || idx} data={sec} />;
        })}
      </main>
      <Footer user={user} cms={content["site.footer"]} />
    </div>
  );
}
