import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import { getCmsPage } from "../../services/api";
import { useConfig } from "../../contexts/ConfigContext";
import { useTheme } from "../../contexts/ThemeContext";

// CMS-driven footer links (see admin-backend's migrate_global_nav_footer.py
// seed data) fall back to this array if the "global-footer" CMS page is
// empty or unreachable -- same pattern as FeaturesPage.jsx/SolutionsPage.jsx.
const FALLBACK_FOOTER_LINKS = [
  { label: "Features", link: "/features", group: "" },
  { label: "Solutions", link: "/solutions", group: "" },
  { label: "How it works", link: "/how-it-works", group: "" },
  { label: "Help Centre", link: "/help", group: "" },
  { label: "Pricing", link: "/pricing", group: "" },
  { label: "Blog", link: "/blog", group: "" },
  { label: "About", link: "/about", group: "" },
];

// Social links come from the existing platform_settings{key:"branding"}
// fields (already admin-editable via BrandPage.jsx and already fetched into
// ConfigContext) rather than a new CMS section, so this reuses the existing
// global-settings system instead of duplicating it.
const SOCIAL_PLATFORMS = [
  { key: "social_twitter", label: "Twitter / X" },
  { key: "social_linkedin", label: "LinkedIn" },
  { key: "social_github", label: "GitHub" },
  { key: "social_youtube", label: "YouTube" },
];

function substituteYear(text) {
  return (text || "").replace("{year}", String(new Date().getFullYear()));
}

export default function Footer({ user }) {
  const { branding } = useConfig();
  const { theme } = useTheme();
  const [cmsSections, setCmsSections] = useState(null);

  useEffect(() => {
    getCmsPage("global-footer")
      .then((res) => setCmsSections(res.sections || []))
      .catch((err) => console.warn("Failed to load footer CMS content, using built-in defaults", err));
  }, []);

  const footerSection = cmsSections?.find((s) => s.key === "sec_footer");
  const links = (footerSection?.cards?.length ? footerSection.cards : FALLBACK_FOOTER_LINKS).filter((item) => !item?.hidden);
  const hasGroups = links.some((item) => item.group);
  const groupedLinks = hasGroups
    ? Object.entries(
        links.reduce((acc, item) => {
          const key = item.group || "";
          (acc[key] ||= []).push(item);
          return acc;
        }, {})
      )
    : null;

  // Footer-specific CMS fields win; fall back to the site-wide Branding
  // values (theme-aware logo) before finally falling back to the hardcoded
  // literal, so Branding is actually consumed rather than merely stored.
  const brandingLogo = theme === "dark" ? (branding.logo_dark_url || branding.logo_url) : branding.logo_url;
  const logoImageUrl = footerSection?.logo_image_url || brandingLogo || "";
  const productName = footerSection?.product_name || branding.product_name || "VOXO";
  const description = footerSection?.description || branding.footer_text || "VOXO — Real-time multilingual meetings without language barriers.";
  const ctaLabel = footerSection?.cta_label || "Ready to meet across languages?";
  const copyrightText = substituteYear(footerSection?.copyright_text || branding.copyright_text) || `© ${new Date().getFullYear()} VOXO by WorknAI Technologies India Pvt. Ltd. All rights reserved.`;
  const secondaryText = footerSection?.secondary_text || "Meet, speak, and collaborate in any language.";
  const contactEmail = footerSection?.contact_email || "";
  const contactPhone = footerSection?.contact_phone || "";

  const socialLinks = SOCIAL_PLATFORMS.map((p) => ({ ...p, url: branding?.[p.key] })).filter((p) => p.url);

  return (
    <footer className="landing-footer border-t border-white/10 bg-brand-dark py-12 text-brand-bg">
      <div className="landing-shell landing-footer__grid">
        <div>
          <Link to="/" className="brand-lockup flex items-center gap-2 font-bold text-lg">
            {logoImageUrl ? (
              <img src={logoImageUrl} alt={productName} className="landing-footer__logo-image" />
            ) : (
              <span className="brand-mark bg-brand-accent text-white px-2 py-1 rounded-md text-xs font-black">VX</span>
            )}
            <span>{productName}</span>
          </Link>
          <p className="mt-2 text-xs text-ui-muted max-w-xs">{description}</p>
          {(contactEmail || contactPhone) && (
            <div className="landing-footer__contact">
              {contactEmail && <a href={`mailto:${contactEmail}`}>{contactEmail}</a>}
              {contactPhone && <a href={`tel:${contactPhone}`}>{contactPhone}</a>}
            </div>
          )}
          {socialLinks.length > 0 && (
            <div className="landing-footer__social">
              {socialLinks.map((p) => (
                <a key={p.key} href={p.url} target="_blank" rel="noopener noreferrer" aria-label={p.label} title={p.label}>
                  <ExternalLink size={14} />
                </a>
              ))}
            </div>
          )}
        </div>
        {hasGroups ? (
          <nav aria-label="Footer navigation" className="flex flex-wrap gap-8 text-xs font-semibold">
            {groupedLinks.map(([groupTitle, groupItems]) => (
              <div key={groupTitle || "ungrouped"} className="landing-footer__group">
                {groupTitle && <p className="landing-footer__group-title">{groupTitle}</p>}
                {groupItems.map((item) => (
                  <Link key={item.link} to={item.link} className="hover:text-brand-accent transition">
                    {item.label}
                  </Link>
                ))}
              </div>
            ))}
          </nav>
        ) : (
          <nav aria-label="Footer navigation" className="flex flex-wrap gap-4 text-xs font-semibold">
            {links.map((item) => (
              <Link key={item.link} to={item.link} className="hover:text-brand-accent transition">
                {item.label}
              </Link>
            ))}
          </nav>
        )}
        <div className="landing-footer__action">
          <p className="text-xs text-ui-muted mb-2">{ctaLabel}</p>
          <div className="flex items-center gap-2">
            {!user && <Link to="/login" className="button button--quiet">Sign in</Link>}
            <Link to={user ? "/chat" : "/signup"} className="button button--primary">
              {user ? "Open Workspace" : "Get Started"}
            </Link>
          </div>
        </div>
      </div>
      <div className="landing-shell landing-footer__legal border-t border-white/10 mt-8 pt-6 flex flex-wrap justify-between text-[11px] text-ui-subtle">
        <span>{copyrightText}</span>
        <span>{secondaryText}</span>
      </div>
    </footer>
  );
}
