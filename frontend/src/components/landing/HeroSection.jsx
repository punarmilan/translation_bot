import { Link } from "react-router-dom";

function MeetingMockup() {
  return (
    <div className="meeting-mockup" aria-label="Animated preview of a multilingual meeting">
      <div className="mockup-topbar">
        <span><i className="status-dot" /> Product review</span>
        <span>04:28</span>
      </div>
      <div className="mockup-body">
        <div className="mockup-stage">
          <div className="mockup-video mockup-video--speaker">
            <div className="mockup-person mockup-person--one"><span>AK</span></div>
            <div className="mockup-name"><span>Aarav</span><small>Hindi</small></div>
            <div className="mockup-caption">
              <small>Live translation · English</small>
              Let’s review the launch plan together.
            </div>
          </div>
          <div className="mockup-rail">
            <div className="mockup-video">
              <div className="mockup-person mockup-person--two"><span>MS</span></div>
              <div className="mockup-name"><span>Maria</span><small>Spanish</small></div>
            </div>
            <div className="mockup-video">
              <div className="mockup-person mockup-person--three"><span>JL</span></div>
              <div className="mockup-name"><span>Julien</span><small>French</small></div>
            </div>
          </div>
        </div>
        <aside className="mockup-chat">
          <div className="mockup-chat__head"><strong>Conversation</strong><span>3 online</span></div>
          <div className="mockup-message"><small>Maria · ES → EN</small><p>The timeline works for our team.</p></div>
          <div className="mockup-message mockup-message--active"><small>Translation Bot</small><p>Voice translation ready</p></div>
          <div className="mockup-message"><small>Julien · FR → EN</small><p>I will share the final notes.</p></div>
        </aside>
      </div>
      <div className="mockup-controls">
        <span aria-label="Microphone on">Mic</span>
        <span aria-label="Camera on">Camera</span>
        <span className="mockup-controls__translation">Translating</span>
        <span aria-label="Share screen">Share</span>
        <span className="mockup-controls__leave">Leave</span>
      </div>
      <div className="floating-status floating-status--top">
        <i className="status-dot" />
        Connection stable
      </div>
      <div className="floating-status floating-status--bottom">
        Voice generated · 842 ms
      </div>
      <div className="floating-visual floating-visual--captions" aria-hidden="true">
        <span>CC</span>
        Live captions
      </div>
      <div className="floating-visual floating-visual--language" aria-hidden="true">
        <span>HI</span>
        <i />
        <span>EN</span>
      </div>
      <div className="floating-visual floating-visual--voice" aria-hidden="true">
        <b /><b /><b /><b /><b />
      </div>
    </div>
  );
}

export default function HeroSection({ user, cms }) {
  const kicker = cms?.eyebrow || "Meet naturally across languages";
  const title = cms?.title || "Speak Your Language. Everyone Else Will Understand.";
  const body = cms?.body || "AI-powered multilingual meetings with live voice translation, captions, and seamless collaboration.";
  const primaryBtn = cms?.primary_button || (user ? "Open workspace" : "Get started");
  const secondaryBtn = cms?.secondary_button || "Explore features";

  return (
    <section id="top" className="hero-section">
      <div className="landing-shell hero-grid">
        <div className="hero-copy reveal">
          <span className="hero-kicker">{kicker}</span>
          <h1>{title}</h1>
          <p>{body}</p>
          <div className="hero-actions">
            <Link to={user ? "/chat" : "/signup"} className="button button--primary button--large">
              {primaryBtn}
            </Link>
            <Link to="/features" className="button button--secondary button--large">{secondaryBtn}</Link>
            <Link to="/how-it-works" className="button button--quiet button--large">See how it works</Link>
          </div>
          <div className="hero-proof">
            <span><i className="status-dot" /> Translation happens automatically</span>
            <span>Your language stays your choice</span>
          </div>
        </div>
        <div className="hero-visual reveal"><MeetingMockup /></div>
      </div>
      <Link className="section-cue" to="/features">Explore the platform <span aria-hidden="true">↓</span></Link>
    </section>
  );
}
