import { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import Footer from "../components/landing/Footer";
import Navbar from "../components/landing/Navbar";
import GenericSectionRenderer from "../components/cms/GenericSectionRenderer";
import { getCmsPage } from "../services/api";

/**
 * Generic page view for the Phase 1 CMS foundation: given a `page` key, it
 * fetches that page's published sections and renders them through the
 * type-agnostic GenericSectionRenderer. Not wired into the router yet --
 * later phases add a <Route path="/features" element={<CmsPageView page="features" />} />
 * (etc.) once a page's real content has been authored in the admin console,
 * without writing any new per-page rendering code.
 */
export default function CmsPageView({ page }) {
  const { user } = useAuth();
  const [sections, setSections] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    getCmsPage(page)
      .then((data) => { if (!cancelled) setSections(data.sections || []); })
      .catch(() => { if (!cancelled) setError("This page has no published content yet."); });
    return () => { cancelled = true; };
  }, [page]);

  return (
    <div className="landing-page">
      <Navbar user={user} />
      <main>
        {error && <p className="admin-empty-copy" style={{ padding: 40, textAlign: "center" }}>{error}</p>}
        {sections && <GenericSectionRenderer sections={sections} />}
      </main>
      <Footer user={user} />
    </div>
  );
}
