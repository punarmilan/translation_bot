import { useEffect, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import ThemeToggle from "./ThemeToggle";

const links = [
  ["Features", "/features"],
  ["Solutions", "/solutions"],
  ["How it works", "/how-it-works"],
  ["Pricing", "/pricing"],
  ["Help Center", "/help"],
];

export default function Navbar({ user }) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 10);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  useEffect(() => setOpen(false), [location.pathname]);

  return (
    <header className={`landing-nav ${scrolled ? "is-scrolled" : ""}`}>
      <nav className="landing-shell landing-nav__inner" aria-label="Main navigation">
        <Link to="/" className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">TB</span>
          <span>Translation Bot</span>
        </Link>

        <button
          type="button"
          className="nav-menu-button"
          aria-expanded={open}
          aria-controls="landing-menu"
          aria-label="Toggle navigation"
          onClick={() => setOpen((value) => !value)}
        >
          <span /><span /><span />
        </button>

        <div id="landing-menu" className={`landing-nav__menu ${open ? "is-open" : ""}`}>
          <div className="landing-nav__links">
            {links.map(([label, path]) => (
              <NavLink key={path} to={path} className={({ isActive }) => isActive ? "is-active" : ""}>
                {label}
                {path === "/pricing" && <small>Coming soon</small>}
              </NavLink>
            ))}
          </div>
          <div className="landing-nav__actions">
            <ThemeToggle />
            {!user && <Link to="/login" className="button button--quiet">Sign in</Link>}
            <Link to={user ? "/chat" : "/signup"} className="button button--primary">
              {user ? "Open workspace" : "Get started"}
            </Link>
          </div>
        </div>
      </nav>
    </header>
  );
}
