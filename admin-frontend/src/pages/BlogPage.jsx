import { BookOpenText, CheckCircle2, Plus, RefreshCw, Save, Search, Star, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import AdminPageHeader from "../components/AdminPageHeader";
import AssetPickerInput from "../components/cms/AssetPickerInput";
import RichTextEditor from "../components/cms/RichTextEditor";
import {
  createBlogPost,
  deleteBlogPost,
  getBlogPost,
  listBlogPosts,
  publishBlogPost,
  unpublishBlogPost,
  updateBlogPost,
} from "../services/api";

const EMPTY_FORM = {
  title: "",
  slug: "",
  excerpt: "",
  body_html: "",
  category: "General",
  tags: "",
  cover_image_url: "",
  featured: false,
  publish_at: "",
  seo: { meta_title: "", meta_description: "", og_image_url: "" },
};

function StatusPill({ status }) {
  return <span className={`cms-page-status cms-page-status--${status === "published" ? "published" : "draft"}`}>{status}</span>;
}

function toFormState(doc) {
  return {
    title: doc.title || "",
    slug: doc.slug || "",
    excerpt: doc.excerpt || "",
    body_html: doc.body_html || "",
    category: doc.category || "General",
    tags: (doc.tags || []).join(", "),
    cover_image_url: doc.cover_image_url || "",
    featured: !!doc.featured,
    publish_at: doc.publish_at ? doc.publish_at.slice(0, 16) : "",
    seo: doc.seo || { meta_title: "", meta_description: "", og_image_url: "" },
  };
}

function toPayload(form) {
  return {
    title: form.title,
    slug: form.slug || undefined,
    excerpt: form.excerpt,
    body_html: form.body_html,
    category: form.category || "General",
    tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
    cover_image_url: form.cover_image_url,
    featured: form.featured,
    publish_at: form.publish_at ? new Date(form.publish_at).toISOString() : null,
    clear_publish_at: !form.publish_at,
    seo: form.seo,
  };
}

export default function BlogPage() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [currentDoc, setCurrentDoc] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const loadPosts = (preferId) => {
    setLoading(true);
    listBlogPosts({ search: search || undefined })
      .then((data) => {
        const items = data.items || [];
        setPosts(items);
        const next = preferId !== undefined ? preferId : (selectedId || items[0]?._id || "");
        setSelectedId(next);
      })
      .catch((err) => setMessage(err.response?.data?.detail || "Could not load blog posts"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    const timeout = setTimeout(() => loadPosts(), 250);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  useEffect(() => {
    if (!selectedId) { setCurrentDoc(null); setForm(EMPTY_FORM); return; }
    getBlogPost(selectedId)
      .then((doc) => { setCurrentDoc(doc); setForm(toFormState(doc)); })
      .catch((err) => setMessage(err.response?.data?.detail || "Could not load post"));
  }, [selectedId]);

  const handleCreate = async () => {
    try {
      const created = await createBlogPost({ title: "Untitled post" });
      setMessage("Draft post created");
      loadPosts(created._id);
    } catch (err) {
      setMessage(err.response?.data?.detail || "Could not create post");
    }
  };

  const handleSave = async () => {
    if (!currentDoc) return;
    setSaving(true);
    setMessage("");
    try {
      const updated = await updateBlogPost(currentDoc._id, toPayload(form));
      setCurrentDoc(updated);
      setForm(toFormState(updated));
      setMessage("Draft saved");
      loadPosts(currentDoc._id);
    } catch (err) {
      setMessage(err.response?.data?.detail || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handlePublishToggle = async () => {
    if (!currentDoc) return;
    setSaving(true);
    try {
      await handleSave();
      const updated = currentDoc.status === "published"
        ? await unpublishBlogPost(currentDoc._id)
        : await publishBlogPost(currentDoc._id);
      setCurrentDoc(updated);
      setForm(toFormState(updated));
      setMessage(updated.status === "published" ? "Post published" : "Post moved back to draft");
      loadPosts(currentDoc._id);
    } catch (err) {
      setMessage(err.response?.data?.detail || "Could not change publish state");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!currentDoc) return;
    if (!window.confirm(`Delete "${currentDoc.title}"? This cannot be undone.`)) return;
    try {
      await deleteBlogPost(currentDoc._id);
      setMessage("Post deleted");
      loadPosts("");
    } catch (err) {
      setMessage(err.response?.data?.detail || "Delete failed");
    }
  };

  const scheduledNote = useMemo(() => {
    if (!form.publish_at || currentDoc?.status !== "published") return null;
    const scheduledFor = new Date(form.publish_at);
    return scheduledFor > new Date()
      ? `Scheduled -- goes live publicly at ${scheduledFor.toLocaleString()}`
      : null;
  }, [form.publish_at, currentDoc]);

  return (
    <>
      <AdminPageHeader
        eyebrow="Content"
        title="Blog"
        description="Categories, tags, rich text, SEO, cover images, featured posts, draft/publish, scheduled publishing, and search -- one post per document."
      >
        <button className="admin-button admin-button--secondary" onClick={handleCreate}>
          <Plus size={15} />New post
        </button>
      </AdminPageHeader>

      {message && <div className="admin-alert">{message}<button onClick={() => setMessage("")}><X size={14} /></button></div>}

      <section className="admin-editor-layout">
        <aside className="admin-section-list">
          <header><BookOpenText size={17} /><strong>Posts</strong></header>
          <div className="admin-toolbar" style={{ padding: "0 12px 10px" }}>
            <label><Search size={14} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search title, excerpt, tags..." /></label>
          </div>
          {loading && <div className="admin-skeleton" />}
          {!loading && posts.length === 0 && <p className="admin-empty-copy" style={{ padding: 14 }}>No posts yet. Create one to get started.</p>}
          {posts.map((item) => (
            <button key={item._id} className={item._id === selectedId ? "is-active" : ""} onClick={() => setSelectedId(item._id)}>
              <span>
                <strong>{item.title}{item.featured ? " ★" : ""}</strong>
                <small>{item.category} · {(item.tags || []).join(", ") || "no tags"}</small>
              </span>
              <StatusPill status={item.status} />
            </button>
          ))}
        </aside>

        <article className="admin-content-editor">
          {!currentDoc && <p className="admin-empty-copy">Select or create a post to edit it.</p>}
          {currentDoc && (
            <>
              <header>
                <div>
                  <span>/{currentDoc.slug}</span>
                  <h2>{form.title || "Untitled post"}</h2>
                  <p><StatusPill status={currentDoc.status} />{scheduledNote ? ` · ${scheduledNote}` : ""}</p>
                </div>
              </header>

              <div className="admin-form-grid">
                <label className="cms-field cms-field--wide">
                  <span className="cms-field-label">Title</span>
                  <input type="text" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
                </label>
                <label className="cms-field">
                  <span className="cms-field-label">Slug</span>
                  <input type="text" value={form.slug} onChange={(event) => setForm({ ...form, slug: event.target.value })} placeholder="auto-generated from title if left blank" />
                </label>
                <label className="cms-field">
                  <span className="cms-field-label">Category</span>
                  <input type="text" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} />
                </label>
                <label className="cms-field">
                  <span className="cms-field-label">Tags (comma-separated)</span>
                  <input type="text" value={form.tags} onChange={(event) => setForm({ ...form, tags: event.target.value })} placeholder="translation, product, release" />
                </label>
                <label className="cms-field" style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <input type="checkbox" checked={form.featured} onChange={(event) => setForm({ ...form, featured: event.target.checked })} />
                  <span className="cms-field-label" style={{ margin: 0 }}><Star size={13} style={{ verticalAlign: -2 }} /> Featured post</span>
                </label>
                <label className="cms-field cms-field--wide">
                  <span className="cms-field-label">Excerpt</span>
                  <textarea value={form.excerpt} maxLength={400} onChange={(event) => setForm({ ...form, excerpt: event.target.value })} />
                </label>
                <div className="cms-field cms-field--wide">
                  <AssetPickerInput label="Cover image" value={form.cover_image_url} onChange={(value) => setForm({ ...form, cover_image_url: value })} />
                </div>
                <label className="cms-field">
                  <span className="cms-field-label">Scheduled publish (optional)</span>
                  <input type="datetime-local" value={form.publish_at} onChange={(event) => setForm({ ...form, publish_at: event.target.value })} />
                </label>
              </div>

              <section className="cms-section-card" style={{ margin: "16px 0" }}>
                <header className="cms-section-card__header"><div className="cms-section-card__title"><span>Body</span></div></header>
                <RichTextEditor value={form.body_html} onChange={(html) => setForm({ ...form, body_html: html })} placeholder="Write the post..." />
              </section>

              <section className="cms-section-card" style={{ marginBottom: 16 }}>
                <header className="cms-section-card__header"><div className="cms-section-card__title"><Search size={14} style={{ marginRight: 6 }} /><span>SEO metadata</span></div></header>
                <div className="admin-form-grid">
                  <label className="cms-field cms-field--wide">
                    <span className="cms-field-label">Meta title</span>
                    <input type="text" maxLength={70} value={form.seo.meta_title} onChange={(event) => setForm({ ...form, seo: { ...form.seo, meta_title: event.target.value } })} />
                  </label>
                  <label className="cms-field cms-field--wide">
                    <span className="cms-field-label">Meta description</span>
                    <textarea maxLength={200} value={form.seo.meta_description} onChange={(event) => setForm({ ...form, seo: { ...form.seo, meta_description: event.target.value } })} />
                  </label>
                  <div className="cms-field cms-field--wide">
                    <AssetPickerInput label="Social share image (og:image)" value={form.seo.og_image_url} onChange={(value) => setForm({ ...form, seo: { ...form.seo, og_image_url: value } })} />
                  </div>
                </div>
              </section>

              <footer>
                <button className="admin-button admin-button--secondary" onClick={handleDelete}>
                  <Trash2 size={15} />Delete
                </button>
                <button className="admin-button admin-button--secondary" onClick={handleSave} disabled={saving}>
                  <Save size={15} />Save draft
                </button>
                <button className="admin-button admin-button--primary" onClick={handlePublishToggle} disabled={saving}>
                  {saving ? <RefreshCw className="animate-spin" size={15} /> : <CheckCircle2 size={15} />}
                  {currentDoc.status === "published" ? "Unpublish" : "Publish"}
                </button>
              </footer>
            </>
          )}
        </article>
      </section>
    </>
  );
}
