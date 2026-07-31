import SafeHtml from "./SafeHtml";

/**
 * Structural, type-agnostic preview of a page's draft sections. This proves
 * out the "live preview" concept for the generic CMS engine -- it is not the
 * production visual design (each page's real look comes from the public
 * frontend's generic rendering pipeline once a page is wired up in a later
 * phase), just an admin-facing approximation so editors can see the shape of
 * what they are about to publish without leaving the admin console.
 */
export default function PagePreview({ sections }) {
  const visible = (sections || []).filter((section) => !section.hidden);
  if (visible.length === 0) {
    return <p className="admin-empty-copy">No visible sections to preview yet.</p>;
  }
  return (
    <div className="cms-preview">
      {visible.map((section, idx) => (
        <div className="cms-preview__section" key={section.key || idx}>
          {section.eyebrow && <p className="cms-preview__eyebrow">{section.eyebrow}</p>}
          {section.title && <h3 style={{ margin: "4px 0" }}>{section.title}</h3>}
          <SafeHtml as="div" html={section.body} style={{ color: "var(--muted)", margin: 0 }} />
          {(section.cta_text || section.secondary_cta_text) && (
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              {section.cta_text && <span className="admin-button admin-button--primary" style={{ pointerEvents: "none" }}>{section.cta_text}</span>}
              {section.secondary_cta_text && <span className="admin-button admin-button--secondary" style={{ pointerEvents: "none" }}>{section.secondary_cta_text}</span>}
            </div>
          )}
          {section.image_url && (
            <img src={section.image_url} alt="" style={{ maxWidth: "100%", borderRadius: 8, marginTop: 12 }} onError={(e) => { e.currentTarget.style.display = "none"; }} />
          )}
          {Array.isArray(section.cards) && section.cards.length > 0 && (
            <div className="cms-preview__cards">
              {section.cards.map((card, cardIdx) => (
                <div className="cms-preview__card" key={cardIdx}>
                  {card.icon && <div style={{ fontSize: 20 }}>{card.icon}</div>}
                  <strong>{card.title || card.question || card.author || card.name || card.value || `Item ${cardIdx + 1}`}</strong>
                  <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--muted)" }}>{card.description || card.answer || card.label || ""}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
