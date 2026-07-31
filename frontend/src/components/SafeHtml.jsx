import DOMPurify from "dompurify";

/**
 * Renders CMS-authored rich-text HTML. The admin backend already sanitizes
 * this HTML server-side before it's ever persisted (see
 * admin-backend/app/cms/sanitize.py) -- this pass is defense-in-depth only,
 * not the authoritative filter.
 */
export default function SafeHtml({ html, className, as: Tag = "div", ...rest }) {
  if (!html) return null;
  const clean = DOMPurify.sanitize(html, {
    ADD_TAGS: ["iframe"],
    ADD_ATTR: ["allow", "allowfullscreen", "frameborder", "target"],
  });
  return <Tag className={className} dangerouslySetInnerHTML={{ __html: clean }} {...rest} />;
}
