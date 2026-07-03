import { ArrowRight, AudioLines, Captions, Languages, MessageCircle, Video } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import Footer from "../landing/Footer";
import Navbar from "../landing/Navbar";

export function MarketingPage({ children }) {
  const { user } = useAuth();
  return (
    <div className="landing-page marketing-page">
      <Navbar user={user} />
      <main className="marketing-main">{children}</main>
      <Footer user={user} />
    </div>
  );
}

export function PageHeader({ eyebrow, title, description, children, tone = "blue" }) {
  return (
    <header className={`page-header page-header--${tone}`}>
      <div className="landing-shell page-header__inner">
        <div>
          <p className="section-eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          <p>{description}</p>
          {children && <div className="page-header__actions">{children}</div>}
        </div>
        <MeetingIllustration />
      </div>
    </header>
  );
}

export function SectionTitle({ eyebrow, title, description, centered = false }) {
  return (
    <header className={`section-heading ${centered ? "section-heading--center" : ""}`}>
      <p className="section-eyebrow">{eyebrow}</p>
      <h2>{title}</h2>
      {description && <p>{description}</p>}
    </header>
  );
}

export function CTASection({ title = "Ready to meet without language barriers?", text = "Create your account and start a multilingual meeting.", primary = "Launch app" }) {
  const { user } = useAuth();
  return (
    <section className="cta-section">
      <div className="landing-shell cta-section__inner">
        <div><h2>{title}</h2><p>{text}</p></div>
        <div>
          <Link className="button button--primary button--large" to={user ? "/chat" : "/signup"}>{primary}</Link>
          <Link className="button button--secondary button--large" to="/help">Visit Help Center</Link>
        </div>
      </div>
    </section>
  );
}

export function MeetingIllustration() {
  return (
    <div className="marketing-meeting-visual" aria-hidden="true">
      <div className="marketing-meeting-visual__bar"><span />Global planning</div>
      <div className="marketing-meeting-visual__grid">
        {["AM", "NK", "JR"].map((name, index) => (
          <div key={name} className={index === 0 ? "is-speaking" : ""}><span>{name}</span><small>{["Hindi", "English", "French"][index]}</small></div>
        ))}
      </div>
      <div className="marketing-meeting-visual__caption"><Captions size={14} /> We are ready to begin.</div>
      <div className="marketing-meeting-visual__controls">
        <AudioLines size={15} /><Video size={15} /><Languages size={15} /><MessageCircle size={15} />
      </div>
    </div>
  );
}

export function ProductMockup({ icon: Icon = Languages, title, status = "Live", children }) {
  return (
    <div className="product-illustration" aria-hidden="true">
      <div className="product-illustration__top"><span><Icon size={16} />{title}</span><b>{status}</b></div>
      <div className="product-illustration__body">
        <div className="product-illustration__person"><span>AK</span></div>
        <div className="product-illustration__lines"><i /><i /><i /></div>
        {children}
      </div>
    </div>
  );
}

export function LearnMoreLink({ to, children = "Learn more" }) {
  return <Link className="learn-more-link" to={to}>{children}<ArrowRight size={15} /></Link>;
}
