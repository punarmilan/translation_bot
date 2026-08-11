import { CheckCircle2, ChevronDown, ChevronUp, Eye, EyeOff, FileText, History, Plus, RefreshCw, RotateCcw, Save, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import AdminPageHeader from "../components/AdminPageHeader";
import SectionEditor from "../components/cms/SectionEditor";
import PagePreview from "../components/cms/PagePreview";
import AssetPickerInput from "../components/cms/AssetPickerInput";
import {
  addCmsSection,
  createCmsPage,
  getCmsPage,
  getCmsPageVersions,
  getCmsSectionTypes,
  listCmsPages,
  mintCmsPreviewToken,
  publishCmsPage,
  revertCmsPage,
  saveCmsPageDraft,
} from "../services/api";

// Pages with a real, pixel-accurate public route wired up (see
// frontend/src/pages/PreviewRoute.jsx). Any other page falls back to the
// generic structural PagePreview -- no public route needed to try the engine.
const PREVIEW_CAPABLE_PAGES = ["landing"];
const PUBLIC_FRONTEND_URL = import.meta.env.VITE_PUBLIC_FRONTEND_URL || "http://localhost:5173";

function StatusPill({ status }) {
  return <span className={`cms-page-status cms-page-status--${status}`}>{status}</span>;
}

function SeoPanel({ seo, onChange }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="cms-section-card" style={{ marginBottom: 16 }}>
      <header className="cms-section-card__header">
        <div className="cms-section-card__title">
          <Search size={14} style={{ marginRight: 6 }} />
          <span>Page SEO metadata</span>
        </div>
        <button type="button" className="admin-button admin-button--secondary" onClick={() => setOpen((v) => !v)}>
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </header>
      {open && (
        <div className="admin-form-grid">
          <label className="cms-field cms-field--wide">
            <span className="cms-field-label">Meta title</span>
            <input
              type="text"
              maxLength={70}
              value={seo.meta_title || ""}
              placeholder="Falls back to the site default title if left blank"
              onChange={(event) => onChange({ ...seo, meta_title: event.target.value })}
            />
          </label>
          <label className="cms-field cms-field--wide">
            <span className="cms-field-label">Meta description</span>
            <textarea
              maxLength={200}
              value={seo.meta_description || ""}
              placeholder="Falls back to the site default description if left blank"
              onChange={(event) => onChange({ ...seo, meta_description: event.target.value })}
            />
          </label>
          <div className="cms-field cms-field--wide">
            <AssetPickerInput
              label="Social share image (og:image)"
              value={seo.og_image_url}
              onChange={(value) => onChange({ ...seo, og_image_url: value })}
            />
          </div>
        </div>
      )}
    </section>
  );
}

function CreatePageModal({ onClose, onCreated }) {
  const [page, setPage] = useState("");
  const [label, setLabel] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    setError("");
    try {
      const created = await createCmsPage({ page: page.trim().toLowerCase(), label: label.trim() || page.trim() });
      onCreated(created.page);
    } catch (err) {
      setError(err.response?.data?.detail || "Could not create page");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="admin-modal-backdrop" onMouseDown={onClose}>
      <section className="admin-modal" onMouseDown={(event) => event.stopPropagation()}>
        <header><div><span>New page</span><h2>Register a CMS page</h2></div><button onClick={onClose}><X /></button></header>
        <label>Page key (URL-safe slug)<input value={page} onChange={(event) => setPage(event.target.value)} placeholder="features" /></label>
        <label>Display label<input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Features" /></label>
        {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
        <button className="admin-button admin-button--primary" disabled={saving || !page.trim()} onClick={submit}>
          {saving ? <RefreshCw className="animate-spin" size={15} /> : <Plus size={15} />}
          Create page
        </button>
      </section>
    </div>
  );
}

function VersionHistoryModal({ page, onClose, onRestore }) {
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    getCmsPageVersions(page)
      .then((data) => setVersions(data.items || []))
      .catch((err) => setError(err.response?.data?.detail || "Could not load version history"))
      .finally(() => setLoading(false));
  }, [page]);

  return (
    <div className="admin-modal-backdrop" onMouseDown={onClose}>
      <section className="admin-modal admin-modal--wide" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div><span>{page}</span><h2>Version history</h2></div>
          <button onClick={onClose}><X /></button>
        </header>
        {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
        {loading ? (
          <div className="admin-skeleton" />
        ) : versions.length === 0 ? (
          <p className="admin-empty-copy">No published versions yet -- publish this page at least once to start building history.</p>
        ) : (
          <div className="admin-table-scroll"><table>
            <thead><tr><th>Version</th><th>Published</th><th>By</th><th /></tr></thead>
            <tbody>
              {versions.map((version) => (
                <tr key={version.version}>
                  <td><strong>v{version.version}</strong></td>
                  <td>{version.published_at ? new Date(version.published_at).toLocaleString() : "—"}</td>
                  <td>{version.published_by || "—"}</td>
                  <td>
                    <button
                      type="button"
                      className="admin-button admin-button--secondary"
                      onClick={() => onRestore(version)}
                    >
                      <RotateCcw size={13} />Restore to draft
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </section>
    </div>
  );
}

export default function CmsPage() {
  const [pages, setPages] = useState([]);
  const [sectionTypes, setSectionTypes] = useState([]);
  const [selectedPage, setSelectedPage] = useState("");
  const [pageDoc, setPageDoc] = useState(null);
  const [sections, setSections] = useState([]);
  const [seo, setSeo] = useState({ meta_title: "", meta_description: "", og_image_url: "" });
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [addingType, setAddingType] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const sectionTypeMap = useMemo(() => Object.fromEntries(sectionTypes.map((t) => [t.key, t])), [sectionTypes]);

  const loadPages = (preferPage) => {
    setLoading(true);
    listCmsPages()
      .then((data) => {
        setPages(data.items || []);
        const next = preferPage || selectedPage || data.items?.[0]?.page || "";
        setSelectedPage(next);
      })
      .catch((err) => setMessage(err.response?.data?.detail || "Could not load CMS pages"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    getCmsSectionTypes().then((data) => {
      setSectionTypes(data.items || []);
      if (data.items?.[0]) setAddingType(data.items[0].key);
    }).catch(() => setSectionTypes([]));
    loadPages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setPreviewing(false);
    setPreviewUrl("");
    if (!selectedPage) { setPageDoc(null); setSections([]); setSeo({ meta_title: "", meta_description: "", og_image_url: "" }); return; }
    getCmsPage(selectedPage).then((doc) => {
      setPageDoc(doc);
      setSections(doc.draft?.sections || []);
      setSeo(doc.draft?.seo || { meta_title: "", meta_description: "", og_image_url: "" });
    }).catch((err) => setMessage(err.response?.data?.detail || "Could not load page"));
  }, [selectedPage]);

  const refreshCurrent = async () => {
    const doc = await getCmsPage(selectedPage);
    setPageDoc(doc);
    setSections(doc.draft?.sections || []);
    setSeo(doc.draft?.seo || { meta_title: "", meta_description: "", og_image_url: "" });
  };

  const handleMove = (idx, dir) => {
    const next = [...sections];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    setSections(next);
  };
  const handleToggleHide = (idx) => {
    const next = [...sections];
    next[idx] = { ...next[idx], hidden: !next[idx].hidden };
    setSections(next);
  };
  const handleDelete = (idx) => {
    if (!window.confirm("Delete this section?")) return;
    setSections(sections.filter((_, i) => i !== idx));
  };
  const handleChange = (idx, nextSection) => {
    const next = [...sections];
    next[idx] = nextSection;
    setSections(next);
  };

  const handleAddSection = async () => {
    if (!addingType) return;
    try {
      const typeLabel = sectionTypeMap[addingType]?.label || addingType;
      const updated = await addCmsSection(selectedPage, addingType, `New ${typeLabel}`);
      setPageDoc(updated);
      setSections(updated.draft?.sections || []);
      setSeo(updated.draft?.seo || seo);
      setMessage("Section added to draft");
    } catch (err) {
      setMessage(err.response?.data?.detail || "Could not add section");
    }
  };

  const handleSaveDraft = async () => {
    setSaving(true);
    setMessage("");
    try {
      const updated = await saveCmsPageDraft(selectedPage, sections, seo);
      setPageDoc(updated);
      setMessage("Draft saved");
      loadPages(selectedPage);
    } catch (err) {
      setMessage(err.response?.data?.detail || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    setSaving(true);
    setMessage("");
    try {
      await handleSaveDraft();
      const updated = await publishCmsPage(selectedPage);
      setPageDoc(updated);
      setMessage(`Published as version ${updated.version}`);
      loadPages(selectedPage);
    } catch (err) {
      setMessage(err.response?.data?.detail || "Publish failed");
    } finally {
      setSaving(false);
    }
  };

  const togglePreview = async () => {
    if (previewing) {
      setPreviewing(false);
      setPreviewUrl("");
      return;
    }
    if (!PREVIEW_CAPABLE_PAGES.includes(selectedPage)) {
      setPreviewing(true);
      return;
    }
    setPreviewLoading(true);
    setMessage("");
    try {
      // Save the in-editor draft first so the pixel-accurate iframe preview
      // reflects exactly what's on screen, not the last explicitly-saved draft.
      const savedDoc = await saveCmsPageDraft(selectedPage, sections, seo);
      setPageDoc(savedDoc);
      loadPages(selectedPage);
      const { token } = await mintCmsPreviewToken(selectedPage);
      setPreviewUrl(`${PUBLIC_FRONTEND_URL}/preview/${encodeURIComponent(selectedPage)}?token=${encodeURIComponent(token)}`);
      setPreviewing(true);
    } catch (err) {
      setMessage(err.response?.data?.detail || "Could not open live preview");
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleRevert = async () => {
    if (!window.confirm("Discard draft changes and revert to the last published version?")) return;
    try {
      const updated = await revertCmsPage(selectedPage);
      setPageDoc(updated);
      setSections(updated.draft?.sections || []);
      setSeo(updated.draft?.seo || { meta_title: "", meta_description: "", og_image_url: "" });
      setMessage("Draft reverted to last published version");
      loadPages(selectedPage);
    } catch (err) {
      setMessage(err.response?.data?.detail || "Revert failed");
    }
  };

  const handleRestoreVersion = (version) => {
    setSections(version.sections || []);
    setSeo(version.seo || { meta_title: "", meta_description: "", og_image_url: "" });
    setShowHistory(false);
    setMessage(`Loaded v${version.version} into the draft editor -- review below, then Save draft and Publish to apply it.`);
  };

  return (
    <>
      <AdminPageHeader
        eyebrow="Generic CMS Foundation"
        title="Pages"
        description="One draft/publish engine, one dynamic editor, reused by every page. Add a page, compose it from typed sections, then publish when ready."
      >
        <button className="admin-button admin-button--secondary" onClick={() => setShowCreate(true)}>
          <Plus size={15} />New page
        </button>
      </AdminPageHeader>

      {message && <div className="admin-alert">{message}<button onClick={() => setMessage("")}><X size={14} /></button></div>}

      <section className="admin-editor-layout">
        <aside className="admin-section-list">
          <header><FileText size={17} /><strong>Pages</strong></header>
          {loading && <div className="admin-skeleton" />}
          {!loading && pages.length === 0 && <p className="admin-empty-copy" style={{ padding: 14 }}>No pages yet. Create one to get started.</p>}
          {pages.map((item) => (
            <button key={item.page} className={item.page === selectedPage ? "is-active" : ""} onClick={() => setSelectedPage(item.page)}>
              <span><strong>{item.label}</strong><small>{item.page} · v{item.version} · {item.section_count} sections</small></span>
              <StatusPill status={item.status} />
            </button>
          ))}
        </aside>

        <article className="admin-content-editor">
          {!pageDoc && <p className="admin-empty-copy">Select or create a page to edit its sections.</p>}
          {pageDoc && (
            <>
              <header>
                <div>
                  <span>{pageDoc.page}</span>
                  <h2>{pageDoc.label}</h2>
                  <p>Version {pageDoc.version} · <StatusPill status={pageDoc.status} /></p>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="admin-button admin-button--secondary" onClick={() => setShowHistory(true)}>
                    <History size={15} />History
                  </button>
                  <button className="admin-button admin-button--secondary" onClick={togglePreview} disabled={previewLoading}>
                    {previewLoading ? <RefreshCw className="animate-spin" size={15} /> : previewing ? <EyeOff size={15} /> : <Eye size={15} />}
                    {previewing ? "Edit" : "Preview"}
                  </button>
                </div>
              </header>

              {previewing ? (
                previewUrl ? (
                  <iframe
                    title={`${pageDoc.page} live preview`}
                    src={previewUrl}
                    className="cms-preview-iframe"
                  />
                ) : (
                  <PagePreview sections={sections} />
                )
              ) : (
                <>
                  <SeoPanel seo={seo} onChange={setSeo} />
                  <div className="cms-page-picker" style={{ margin: "16px 0" }}>
                    <select value={addingType} onChange={(event) => setAddingType(event.target.value)}>
                      {sectionTypes.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                    </select>
                    <button className="admin-button admin-button--secondary" onClick={handleAddSection}>
                      <Plus size={15} />Add section
                    </button>
                  </div>

                  {sections.length === 0 && <p className="admin-empty-copy">No sections yet -- add one above.</p>}
                  {sections.map((section, idx) => (
                    <SectionEditor
                      key={section.key || idx}
                      section={section}
                      sectionType={sectionTypeMap[section.type]}
                      index={idx}
                      total={sections.length}
                      onChange={(next) => handleChange(idx, next)}
                      onDelete={() => handleDelete(idx)}
                      onMove={(dir) => handleMove(idx, dir)}
                      onToggleHide={() => handleToggleHide(idx)}
                    />
                  ))}
                </>
              )}

              <footer>
                <button className="admin-button admin-button--secondary" onClick={handleRevert} disabled={saving || pageDoc.status === "draft"}>
                  <RotateCcw size={15} />Revert to published
                </button>
                <button className="admin-button admin-button--secondary" onClick={handleSaveDraft} disabled={saving}>
                  <Save size={15} />Save draft
                </button>
                <button className="admin-button admin-button--primary" onClick={handlePublish} disabled={saving}>
                  {saving ? <RefreshCw className="animate-spin" size={15} /> : <CheckCircle2 size={15} />}
                  Publish
                </button>
              </footer>
            </>
          )}
        </article>
      </section>

      {showCreate && (
        <CreatePageModal
          onClose={() => setShowCreate(false)}
          onCreated={(page) => { setShowCreate(false); loadPages(page); }}
        />
      )}

      {showHistory && pageDoc && (
        <VersionHistoryModal
          page={pageDoc.page}
          onClose={() => setShowHistory(false)}
          onRestore={handleRestoreVersion}
        />
      )}
    </>
  );
}
