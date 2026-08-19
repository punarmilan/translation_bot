import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchAdmin } from "../services/api";
import AdminPageHeader from "../components/AdminPageHeader";
import { Copy, Check, Search, Film, Sparkles, Info } from "lucide-react";

export default function MediaLibraryPage() {
  const [assets, setAssets] = useState([]);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [copiedId, setCopiedId] = useState(null);

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
        description="Browse, search, and copy CDN links for uploaded assets. To upload a new file, use the Media page."
      />

      <section className="admin-alert" style={{ marginTop: "16px", display: "flex", gap: 8, alignItems: "flex-start" }}>
        <Info size={16} style={{ flexShrink: 0, marginTop: 2 }} />
        <span>
          Registering an external CDN URL here previously appeared to work but never persisted anything -- it only
          held the entry in local component state, which was lost on refresh. There is no storage model in this
          admin console for an asset with no locally-uploaded file (every real asset here is backed by a file on
          disk), so that control has been removed rather than left silently broken. To add a new asset, upload a
          file from the <Link to="/admin/media" style={{ textDecoration: "underline" }}>Media</Link> page instead.
        </span>
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
