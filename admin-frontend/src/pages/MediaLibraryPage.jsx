import React, { useEffect, useState } from "react";
import { fetchAdmin } from "../services/api";
import AdminPageHeader from "../components/AdminPageHeader";
import { Upload, Copy, Check, Search, Film, Sparkles, Image as ImageIcon } from "lucide-react";

export default function MediaLibraryPage() {
  const [assets, setAssets] = useState([]);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [copiedId, setCopiedId] = useState(null);
  const [newUrl, setNewUrl] = useState("");
  const [newTitle, setNewTitle] = useState("");

  useEffect(() => {
    fetchAdmin("/media")
      .then((res) => {
        if (res.items) setAssets(res.items);
      })
      .catch((err) => console.warn("Failed to load media assets", err));
  }, []);

  const handleCopyUrl = (url, id) => {
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleAddAsset = async (e) => {
    e.preventDefault();
    if (!newUrl) return;
    const item = {
      filename: newTitle || "External Asset",
      url: newUrl,
      media_type: newUrl.endsWith(".svg") ? "svg" : newUrl.endsWith(".mp4") ? "video" : newUrl.endsWith(".json") ? "lottie" : "image",
      size: 1024,
      created_at: new Date().toISOString(),
    };
    setAssets([item, ...assets]);
    setNewUrl("");
    setNewTitle("");
  };

  const filtered = assets.filter((item) => {
    const matchType = filter === "all" || item.media_type === filter || (filter === "image" && !["video", "svg", "lottie"].includes(item.media_type));
    const matchSearch = !search || (item.filename || "").toLowerCase().includes(search.toLowerCase());
    return matchType && matchSearch;
  });

  return (
    <>
      <AdminPageHeader
        eyebrow="Asset Management & Optimization"
        title="Central Media Library"
        description="Upload or register PNG, SVG, WEBP, AVIF, GIF, Lottie JSON, and Video URLs. Copy CDN links instantly."
      />

      {/* Add New Asset Box */}
      <section className="admin-settings-panel" style={{ marginTop: "16px" }}>
        <header>
          <span>Asset Uploader & CDN Registration</span>
          <h2>Register External Asset or CDN URL</h2>
        </header>
        <form onSubmit={handleAddAsset} className="admin-form-grid" style={{ paddingBottom: 0 }}>
          <label>
            <span>Asset Title / Name</span>
            <input
              type="text"
              placeholder="Hero Graphic / Logo"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
            />
          </label>
          <label>
            <span>CDN / Image URL</span>
            <input
              type="url"
              placeholder="https://cdn.voxo.ai/hero.png or /images/hero.png"
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
            />
          </label>
          <div style={{ gridColumn: "span 2", display: "flex", justifyContent: "flex-end" }}>
            <button
              type="submit"
              disabled={!newUrl}
              className="admin-button admin-button--primary"
            >
              <Upload size={15} />Add to Media Library
            </button>
          </div>
        </form>
      </section>

      {/* Toolbar / Search & Filters */}
      <section className="admin-toolbar" style={{ marginTop: "20px" }}>
        <label>
          <Search size={16} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search media filename..."
          />
        </label>
        <div style={{ display: "flex", gap: "6px" }}>
          {["all", "image", "svg", "video", "lottie"].map((t) => (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className={`admin-button ${filter === t ? "admin-button--primary" : "admin-button--secondary"}`}
              style={{ textTransform: "capitalize" }}
            >
              {t}
            </button>
          ))}
        </div>
      </section>

      {/* Assets Media Grid */}
      <div className="admin-media-grid" style={{ marginTop: "16px" }}>
        {filtered.map((item, idx) => (
          <article key={item._id || idx} className="admin-card" style={{ padding: "12px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
            <div style={{ aspectRatio: "1/1", width: "100%", borderRadius: "8px", overflow: "hidden", background: "var(--surface-sunken)", display: "flex", alignItems: "center", justifyCenter: "center", position: "relative", marginBottom: "10px" }}>
              {item.media_type === "video" ? (
                <Film size={32} style={{ color: "var(--primary)" }} />
              ) : item.media_type === "lottie" ? (
                <Sparkles size={32} style={{ color: "#f59e0b" }} />
              ) : (
                <img src={item.url} alt={item.filename} style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={(e) => { e.target.style.display = 'none'; }} />
              )}
            </div>

            <div>
              <strong style={{ fontSize: "13px", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {item.filename || "Media Asset"}
              </strong>
              <small style={{ fontSize: "10px", color: "var(--muted)", textTransform: "uppercase", display: "block", marginTop: "2px" }}>
                {item.media_type || "image"}
              </small>

              <button
                type="button"
                onClick={() => handleCopyUrl(item.url, item._id || idx)}
                className="admin-button admin-button--secondary"
                style={{ width: "100%", marginTop: "10px", justifyContent: "center" }}
              >
                {copiedId === (item._id || idx) ? <Check size={13} style={{ color: "#10b981" }} /> : <Copy size={13} />}
                {copiedId === (item._id || idx) ? "Copied!" : "Copy CDN Link"}
              </button>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
