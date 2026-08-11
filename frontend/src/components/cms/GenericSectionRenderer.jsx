import { Link } from "react-router-dom";
import SafeHtml from "../SafeHtml";

/**
 * Generic, section-type-driven renderer for CMS pages built on the Phase 1
 * CMS foundation (admin-backend `/api/public/cms/pages/{page}`). Any page --
 * Landing, Features, Pricing, Blogs, Docs, About, or one created later --
 * renders through this single component. Adding a new page never requires
 * new React rendering code, only new content authored in the admin console;
 * adding a new *section type* only requires a case here plus a matching
 * entry in admin-backend/app/cms/section_types.py.
 *
 * This is intentionally simpler than the landing page's hand-tuned section
 * components (HeroSection, DynamicShowcase, etc.) -- it favors consistent,
 * reusable markup over bespoke per-page visual treatment, using the same
 * shared CSS classes (landing-shell, section-eyebrow, cta-section, ...) so it
 * still looks native to the site.
 */

function SectionHeading({ section }) {
  if (!section.eyebrow && !section.title && !section.body) return null;
  return (
    <header className="section-heading">
      {section.eyebrow && <p className="section-eyebrow">{section.eyebrow}</p>}
      {section.title && <h2>{section.title}</h2>}
      <SafeHtml as="div" html={section.body} />
    </header>
  );
}

function StatCard({ card }) {
  return (
    <div className="stat-card">
      {card.icon && <div className="stat-card__icon">{card.icon}</div>}
      <div className="stat-card__value">{card.value}</div>
      <div className="stat-card__label">{card.label}</div>
    </div>
  );
}

function LogoCard({ card }) {
  return (
    <div className="trusted-by-logo">
      {card.logo_url ? (
        <img className="trusted-by-logo__img" src={card.logo_url} alt={card.name || ""} />
      ) : (
        <span className="trusted-by-logo__text">{card.name}</span>
      )}
    </div>
  );
}

function CardGrid({ cards, cardComponent: CardComponent }) {
  if (!Array.isArray(cards) || cards.length === 0) return null;
  return (
    <div className="cms-generic-card-grid">
      {cards.map((card, idx) => <CardComponent key={idx} card={card} />)}
    </div>
  );
}

function BasicCard({ card }) {
  return (
    <div className="cms-generic-card">
      {card.icon && <div className="cms-generic-card__icon">{card.icon}</div>}
      {card.image_url && <img className="cms-generic-card__image" src={card.image_url} alt={card.title || ""} />}
      {card.title && <h3>{card.title}</h3>}
      {card.description && <p>{card.description}</p>}
    </div>
  );
}

function TestimonialCard({ card }) {
  return (
    <div className="cms-generic-card cms-generic-card--testimonial">
      {card.description && <p>&ldquo;{card.description}&rdquo;</p>}
      <footer>
        {card.avatar && <img src={card.avatar} alt={card.author || ""} />}
        <span><strong>{card.author}</strong>{card.role && <small>{card.role}</small>}</span>
      </footer>
    </div>
  );
}

function FaqCard({ card }) {
  return (
    <details className="cms-generic-faq-item">
      <summary>{card.question}</summary>
      <p>{card.answer}</p>
    </details>
  );
}

function CtaButtons({ section }) {
  if (!section.cta_text && !section.secondary_cta_text) return null;
  return (
    <div className="cms-generic-cta-actions">
      {section.cta_text && <Link className="button button--primary button--large" to={section.cta_link || "#"}>{section.cta_text}</Link>}
      {section.secondary_cta_text && <Link className="button button--secondary button--large" to={section.secondary_cta_link || "#"}>{section.secondary_cta_text}</Link>}
    </div>
  );
}

function GenericSection({ section }) {
  const cards = (section.cards || []).filter((card) => !card?.hidden);
  switch (section.type) {
    case "hero":
      return (
        <section className="landing-section cms-generic-hero">
          <div className="landing-shell">
            <SectionHeading section={section} />
            <CtaButtons section={section} />
            {section.image_url && <img className="cms-generic-hero__image" src={section.image_url} alt="" />}
            <CardGrid cards={cards} cardComponent={BasicCard} />
          </div>
        </section>
      );
    case "testimonials":
      return (
        <section className="landing-section">
          <div className="landing-shell">
            <SectionHeading section={section} />
            <CardGrid cards={cards} cardComponent={TestimonialCard} />
          </div>
        </section>
      );
    case "faq":
      return (
        <section className="landing-section">
          <div className="landing-shell faq-layout">
            <SectionHeading section={section} />
            <div className="cms-generic-faq-list">
              {cards.map((card, idx) => <FaqCard key={idx} card={card} />)}
            </div>
          </div>
        </section>
      );
    case "cta":
      return (
        <section className="cta-section">
          <div className="landing-shell cta-section__inner">
            <div>
              {section.title && <h2>{section.title}</h2>}
              <SafeHtml as="div" html={section.body} />
            </div>
            <CtaButtons section={section} />
          </div>
        </section>
      );
    case "footer_cta":
      return (
        <section className="footer-cta-section">
          <div className="landing-shell footer-cta-section__inner">
            {section.title && <h2>{section.title}</h2>}
            <SafeHtml as="div" html={section.body} />
            {section.cta_text && (
              <Link className="button button--primary button--large" to={section.cta_link || "#"}>{section.cta_text}</Link>
            )}
          </div>
        </section>
      );
    case "statistics":
      return (
        <section className="landing-section stats-section">
          <div className="landing-shell">
            <SectionHeading section={section} />
            {cards.length > 0 && (
              <div className="stats-grid">
                {cards.map((card, idx) => <StatCard key={idx} card={card} />)}
              </div>
            )}
          </div>
        </section>
      );
    case "trusted_by":
      return (
        <section className="landing-section trusted-by-section">
          <div className="landing-shell">
            <SectionHeading section={section} />
            {cards.length > 0 && (
              <div className="trusted-by-row">
                {cards.map((card, idx) => <LogoCard key={idx} card={card} />)}
              </div>
            )}
          </div>
        </section>
      );
    case "richtext":
      return (
        <section className="landing-section">
          <div className="landing-shell">
            <SectionHeading section={section} />
          </div>
        </section>
      );
    case "feature_grid":
    case "custom":
    default:
      return (
        <section className="landing-section">
          <div className="landing-shell">
            <SectionHeading section={section} />
            <CardGrid cards={cards} cardComponent={BasicCard} />
          </div>
        </section>
      );
  }
}

export default function GenericSectionRenderer({ sections }) {
  const visible = (sections || []).filter((section) => !section.hidden);
  return <>{visible.map((section, idx) => <GenericSection key={section.key || idx} section={section} />)}</>;
}
