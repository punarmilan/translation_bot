import SafeHtml from "../SafeHtml";

/**
 * Renders only real CMS-authored metric cards -- no hardcoded fallback
 * numbers. A page with zero cards published for this section shows nothing
 * but its own heading (if any), rather than inventing placeholder stats.
 */
export default function StatisticsSection({ data }) {
  const eyebrow = data?.eyebrow || "";
  const title = data?.title || "";
  const body = data?.body || "";
  const cards = data?.cards || [];

  if (!eyebrow && !title && !body && cards.length === 0) return null;

  return (
    <section className="landing-section stats-section">
      <div className="landing-shell">
        {(eyebrow || title || body) && (
          <header className="section-heading section-heading--center">
            {eyebrow && <p className="section-eyebrow">{eyebrow}</p>}
            {title && <h2>{title}</h2>}
            <SafeHtml as="div" html={body} />
          </header>
        )}

        {cards.length > 0 && (
          <div className="stats-grid">
            {cards.map((card, idx) => (
              <div className="stat-card" key={idx}>
                {card.icon && <div className="stat-card__icon">{card.icon}</div>}
                <div className="stat-card__value">{card.value}</div>
                <div className="stat-card__label">{card.label}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
