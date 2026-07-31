import { resolveImageUrl } from "../../services/api";

/**
 * Renders only real CMS-authored partner/customer logos -- no hardcoded
 * fallback names or images. A page with zero cards published for this
 * section shows nothing but its own heading (if any), rather than inventing
 * placeholder partners.
 */
export default function TrustedBySection({ data }) {
  const eyebrow = data?.eyebrow || "";
  const title = data?.title || "";
  const cards = data?.cards || [];

  if (!eyebrow && !title && cards.length === 0) return null;

  return (
    <section className="landing-section trusted-by-section">
      <div className="landing-shell">
        {(eyebrow || title) && (
          <header className="section-heading section-heading--center section-heading--compact">
            {eyebrow && <p className="section-eyebrow">{eyebrow}</p>}
            {title && <h2>{title}</h2>}
          </header>
        )}

        {cards.length > 0 && (
          <div className="trusted-by-row">
            {cards.map((card, idx) => {
              const logo = resolveImageUrl(card.logo_url);
              const content = logo ? (
                <img src={logo} alt={card.name || "Partner logo"} className="trusted-by-logo__img" loading="lazy" />
              ) : (
                <span className="trusted-by-logo__text">{card.name}</span>
              );
              return card.link_url ? (
                <a key={idx} href={card.link_url} target="_blank" rel="noopener noreferrer" className="trusted-by-logo">
                  {content}
                </a>
              ) : (
                <div key={idx} className="trusted-by-logo">
                  {content}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
