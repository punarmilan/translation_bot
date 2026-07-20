import { Link } from "react-router-dom";

const links = [
  ["Features", "/features"],
  ["Solutions", "/solutions"],
  ["How it works", "/how-it-works"],
  ["Help Centre", "/help"],
  ["Pricing", "/pricing"],
  ["Blog", "/blog"],
  ["About", "/about"],
];

export default function Footer({ user, cms }) {
  const tagline = cms?.tagline || "VOXO — Real-time multilingual meetings without language barriers.";

  return (
    <footer className="landing-footer border-t border-white/10 bg-brand-dark py-12 text-brand-bg">
      <div className="landing-shell landing-footer__grid">
        <div>
          <Link to="/" className="brand-lockup flex items-center gap-2 font-bold text-lg">
            <span className="brand-mark bg-brand-accent text-white px-2 py-1 rounded-md text-xs font-black">VX</span>
            <span>VOXO</span>
          </Link>
          <p className="mt-2 text-xs text-ui-muted max-w-xs">{tagline}</p>
        </div>
        <nav aria-label="Footer navigation" className="flex flex-wrap gap-4 text-xs font-semibold">
          {links.map(([label, path]) => (
            <Link key={path} to={path} className="hover:text-brand-accent transition">
              {label}
            </Link>
          ))}
        </nav>
        <div className="landing-footer__action">
          <p className="text-xs text-ui-muted mb-2">Ready to meet across languages?</p>
          <div className="flex items-center gap-2">
            {!user && <Link to="/login" className="button button--quiet">Sign in</Link>}
            <Link to={user ? "/chat" : "/signup"} className="button button--primary">
              {user ? "Open Workspace" : "Get Started"}
            </Link>
          </div>
        </div>
      </div>
      <div className="landing-shell landing-footer__legal border-t border-white/10 mt-8 pt-6 flex flex-wrap justify-between text-[11px] text-ui-subtle">
        <span>© {new Date().getFullYear()} VOXO by WorknAI Technologies India Pvt. Ltd. All rights reserved.</span>
        <span>Meet, speak, and collaborate in any language.</span>
      </div>
    </footer>
  );
}
