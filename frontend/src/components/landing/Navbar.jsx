import { useEffect, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import ThemeToggle from "./ThemeToggle";
import { getCmsPage } from "../../services/api";
import { useConfig } from "../../contexts/ConfigContext";
import { useTheme } from "../../contexts/ThemeContext";

// CMS-driven nav links (see admin-backend's migrate_global_nav_footer.py seed
// data) fall back to this array if the "global-nav" CMS page is empty or
// unreachable -- same pattern as FeaturesPage.jsx/SolutionsPage.jsx.
const FALLBACK_NAV_LINKS = [
  { label: "Home", link: "/", parent_label: "" },
  { label: "Features", link: "/features", parent_label: "" },
  { label: "Solutions", link: "/solutions", parent_label: "" },
  { label: "Pricing", link: "/pricing", parent_label: "" },
  { label: "About", link: "/about", parent_label: "" },
];

export default function Navbar({ user }) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [cmsSections, setCmsSections] = useState(null);
  const location = useLocation();
  const { branding } = useConfig();
  const { theme } = useTheme();

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 10);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  useEffect(() => setOpen(false), [location.pathname]);

  useEffect(() => {
    getCmsPage("global-nav")
      .then((res) => setCmsSections(res.sections || []))
      .catch((err) => console.warn("Failed to load navbar CMS content, using built-in defaults", err));
  }, []);

  const handleScrollToTop = (e) => {
    if (location.pathname === "/") {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handlePricingClick = (e) => {
    if (location.pathname === "/") {
      e.preventDefault();
      const el = document.getElementById("pricing");
      if (el) {
        el.scrollIntoView({ behavior: "smooth" });
      }
    }
  };

  const navSection = cmsSections?.find((s) => s.key === "sec_navbar");
  const navLinks = (navSection?.cards?.length ? navSection.cards : FALLBACK_NAV_LINKS).filter((item) => !item?.hidden);
  const topLevelLinks = navLinks.filter((item) => !item.parent_label);
  const childrenOf = (label) => navLinks.filter((item) => item.parent_label === label);

  // Nav-specific CMS field wins; falls back to the site-wide Branding logo
  // (theme-aware) before finally falling back to the plain text brand mark.
  const brandingLogo = theme === "dark" ? (branding.logo_dark_url || branding.logo_url) : branding.logo_url;
  const logoImageUrl = navSection?.logo_image_url || brandingLogo || "";
  const productName = navSection?.product_name || branding.product_name || "VOXO";
  const loginText = navSection?.login_text || "Sign in";
  const loginLink = navSection?.login_link || "/login";
  const ctaText = navSection?.cta_text || "Get started";
  const ctaLink = navSection?.cta_link || "/signup";

  const renderLink = (item) => {
    if (item.link === "/") {
      return (
        <Link key={item.label} to="/" onClick={handleScrollToTop} className={location.pathname === "/" ? "is-active" : ""}>
          {item.label}
        </Link>
      );
    }
    if (item.link === "/pricing") {
      return (
        <Link key={item.label} to="/pricing" onClick={handlePricingClick} className={location.pathname === "/pricing" ? "is-active" : ""}>
          {item.label}
        </Link>
      );
    }
    return (
      <NavLink key={item.label} to={item.link || "#"} className={({ isActive }) => (isActive ? "is-active" : "")}>
        {item.label}
      </NavLink>
    );
  };

  return (
    <header className={`landing-nav ${scrolled ? "is-scrolled" : ""}`}>
      <nav className="landing-shell landing-nav__inner" aria-label="Main navigation">
        <Link to="/" onClick={handleScrollToTop} className="brand-lockup group">
          {logoImageUrl ? (
            <img src={logoImageUrl} alt={productName} className="landing-nav__logo-image" />
          ) : (
            <span className="brand-mark flex items-center justify-center font-bold tracking-wider" aria-hidden="true">
              VX
            </span>
          )}
          <span className="text-lg font-bold tracking-tight text-brand-bg group-hover:text-brand-accent transition-colors">
            {productName}
          </span>
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
            {topLevelLinks.map((item) => {
              const children = childrenOf(item.label);
              if (children.length === 0) {
                return renderLink(item);
              }
              return (
                <div key={item.label} className="landing-nav__item has-dropdown">
                  {renderLink(item)}
                  <div className="landing-nav__dropdown-panel">
                    {children.map((child) => renderLink(child))}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="landing-nav__actions">
            <ThemeToggle />
            {!user && (
              <Link to={loginLink} className="button button--quiet font-medium">
                {loginText}
              </Link>
            )}
            <Link to={user ? "/chat" : ctaLink} className="button button--primary shadow-md shadow-brand-accent/20">
              {user ? "Open Workspace" : ctaText}
            </Link>
          </div>
        </div>
      </nav>
    </header>
  );
}
