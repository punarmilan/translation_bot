import { Image as ImageIcon, RefreshCw, Search, Upload, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getModule, uploadMedia } from "../../services/api";

const ADMIN_API_URL = import.meta.env.VITE_ADMIN_API_URL || "";

/**
 * Generic reusable image/asset field: a URL input, a direct-upload button,
 * and a "Browse Library" modal listing previously-uploaded media. Used by
 * every "image" field across every section type and page -- there is no
 * per-section-type or per-page copy of this control.
 */
export default function AssetPickerInput({ label, value, onChange, placeholder }) {
  const [uploading, setUploading] = useState(false);
  const [browsing, setBrowsing] = useState(false);
  const [library, setLibrary] = useState([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [search, setSearch] = useState("");
  const fileInputRef = useRef(null);

  const handleUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const asset = await uploadMedia(form);
      if (asset?.url) onChange(`${ADMIN_API_URL}${asset.url}`);
    } catch (err) {
      console.warn("Asset upload failed", err);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const openLibrary = () => {
    setBrowsing(true);
    setLibraryLoading(true);
    getModule("media", { search })
      .then((data) => setLibrary(data.items || []))
      .catch(() => setLibrary([]))
      .finally(() => setLibraryLoading(false));
  };

  useEffect(() => {
    if (!browsing) return;
    const timeout = setTimeout(() => {
      setLibraryLoading(true);
      getModule("media", { search })
        .then((data) => setLibrary(data.items || []))
        .catch(() => setLibrary([]))
        .finally(() => setLibraryLoading(false));
    }, 250);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, browsing]);

  return (
    <div className="cms-asset-picker">
      {label && <span className="cms-field-label">{label}</span>}
      <div className="cms-asset-picker__row">
        <input
          type="text"
          value={value || ""}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder || "https://... or pick from library"}
        />
        <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handleUpload} />
        <button type="button" className="admin-button admin-button--secondary" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
          {uploading ? <RefreshCw className="animate-spin" size={13} /> : <Upload size={13} />}
          Upload
        </button>
        <button type="button" className="admin-button admin-button--secondary" onClick={openLibrary}>
          <ImageIcon size={13} />
          Browse
        </button>
      </div>
      {value && (
        <div className="cms-asset-picker__preview">
          <img src={value} alt="" onError={(event) => { event.currentTarget.style.display = "none"; }} />
        </div>
      )}
      {browsing && (
        <div className="admin-modal-backdrop" onMouseDown={() => setBrowsing(false)}>
          <section className="admin-modal admin-modal--wide" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div><span>Asset picker</span><h2>Media library</h2></div>
              <button onClick={() => setBrowsing(false)}><X /></button>
            </header>
            <div className="admin-toolbar">
              <label><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search assets" /></label>
            </div>
            {libraryLoading ? (
              <div className="admin-skeleton" />
            ) : library.length === 0 ? (
              <p className="admin-empty-copy">No media uploaded yet.</p>
            ) : (
              <section className="cms-asset-picker__grid">
                {library.filter((item) => item.content_type?.startsWith("image/")).map((item) => (
                  <button
                    type="button"
                    key={item.media_id}
                    className="cms-asset-picker__grid-item"
                    onClick={() => { onChange(`${ADMIN_API_URL}${item.url}`); setBrowsing(false); }}
                  >
                    <img src={`${ADMIN_API_URL}${item.url}`} alt={item.alt_text || item.original_name} />
                    <small>{item.original_name}</small>
                  </button>
                ))}
              </section>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
