import { Link } from "react-router-dom";
import SafeHtml from "../SafeHtml";

/**
 * The final call-to-action banner immediately before the site footer.
 * Distinct from the general-purpose "cta" section type/component so it can
 * carry its own footer-adjacent styling and be placed independently.
 */
export default function FooterCtaSection({ data, user }) {
  const title = data?.title || "";
  const body = data?.body || "";
  const ctaText = data?.cta_text || "";
  const ctaLink = data?.cta_link || (user ? "/chat" : "/signup");

  if (!title && !body && !ctaText) return null;

  return (
    <section className="footer-cta-section">
      <div className="landing-shell footer-cta-section__inner">
        {title && <h2>{title}</h2>}
        <SafeHtml as="div" html={body} />
        {ctaText && (
          <Link to={ctaLink} className="button button--primary button--large">
            {ctaText}
          </Link>
        )}
      </div>
    </section>
  );
}
