import { Link } from "react-router-dom";

const links = [
  ["Features", "/features"],
  ["Solutions", "/solutions"],
  ["How it works", "/how-it-works"],
  ["Help Center", "/help"],
  ["Pricing", "/pricing"],
  ["Blog", "/blog"],
];

export default function Footer({ user, cms }) {
  const tagline = cms?.tagline || "Real-time multilingual meetings without language barriers.";

  return (
    <footer className="landing-footer">
      <div className="landing-shell landing-footer__grid">
        <div>
          <Link to="/" className="brand-lockup"><span className="brand-mark">TB</span><span>Translation Bot</span></Link>
          <p>{tagline}</p>
        </div>
        <nav aria-label="Footer navigation">
          {links.map(([label, path]) => <Link key={path} to={path}>{label}</Link>)}
        </nav>
        <div className="landing-footer__action">
          <p>Ready to meet across languages?</p>
          {!user && <Link to="/login" className="button button--quiet">Sign in</Link>}
          <Link to={user ? "/chat" : "/signup"} className="button button--primary">
            {user ? "Open workspace" : "Get started"}
          </Link>
        </div>
      </div>
      <div className="landing-shell landing-footer__legal">
        <span>Translation Bot</span>
        <span>Meet, speak, and collaborate across languages.</span>
      </div>
    </footer>
  );
}
