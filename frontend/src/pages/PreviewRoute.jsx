import { useParams, useSearchParams } from "react-router-dom";
import LandingPage from "./LandingPage";

/**
 * Generic entry point for /preview/:page, opened in an <iframe> by the admin
 * console's CMS editor so a draft can be reviewed with pixel-accurate styling
 * before publishing. Renders the same real page component the public site
 * uses -- no separate preview-only rendering logic -- just fed draft content
 * (via the `previewToken` prop) instead of published content.
 *
 * Add an entry here whenever a later phase migrates another page (Features,
 * Pricing, Blogs, ...) onto the generic CMS engine.
 */
const PREVIEW_PAGE_COMPONENTS = {
  landing: LandingPage,
};

export default function PreviewRoute() {
  const { page } = useParams();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const PageComponent = PREVIEW_PAGE_COMPONENTS[page];

  if (!PageComponent || !token) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "var(--text, #fff)" }}>
        <p>{!token ? "Missing preview token." : `No preview is available for "${page}" yet.`}</p>
      </div>
    );
  }

  return <PageComponent previewToken={token} />;
}
