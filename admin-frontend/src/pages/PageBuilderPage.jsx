import React, { useEffect, useRef, useState } from "react";
import { fetchAdmin, postAdmin, uploadMedia } from "../services/api";
import AdminPageHeader from "../components/AdminPageHeader";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  Upload,
} from "lucide-react";

function ImageUploaderInput({ label, value, onChange, placeholder }) {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);

    try {
      // 1. Instant DataURL preview (works 100% offline & locally)
      const reader = new FileReader();
      reader.onload = async (event) => {
        const dataUrl = event.target.result;
        onChange(dataUrl);

        // 2. Upload to admin media repository if backend is active
        try {
          const formData = new FormData();
          formData.append("file", file);
          const res = await uploadMedia(formData);
          if (res && res.url) {
            onChange(res.url);
          }
        } catch (err) {
          console.warn("Server upload fallback to local DataURL", err);
        }
        setUploading(false);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error("Upload failed", err);
      setUploading(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "5px", width: "100%" }}>
      {label && (
        <span style={{ fontSize: "11px", fontWeight: "700", color: "var(--text)", textTransform: "uppercase", letterSpacing: "0.03em" }}>
          {label}
        </span>
      )}
      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
        <input
          type="text"
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder || "/images/graphic.png or upload..."}
          style={{
            flex: 1,
            background: "var(--surface)",
            color: "var(--text)",
            border: "1px solid var(--line)",
            borderRadius: "6px",
            padding: "8px 12px",
            fontSize: "13px",
          }}
        />
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept="image/*"
          style={{ display: "none" }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="admin-button admin-button--secondary"
          style={{
            padding: "8px 12px",
            fontSize: "11px",
            fontWeight: "600",
            whiteSpace: "nowrap",
            flexShrink: 0,
            display: "inline-flex",
            alignItems: "center",
            gap: "5px",
          }}
        >
          {uploading ? <RefreshCw className="animate-spin" size={13} /> : <Upload size={13} />}
          {uploading ? "Uploading..." : "Upload Device File"}
        </button>
      </div>
    </div>
  );
}

export default function PageBuilderPage() {
  const [sections, setSections] = useState([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [expandedSection, setExpandedSection] = useState(null);

  useEffect(() => {
    fetchAdmin("/page-builder")
      .then((res) => {
        if (res.items && res.items.length > 0) {
          setSections(res.items);
        }
      })
      .catch((err) => console.warn("Failed to load page builder sections", err));
  }, []);

  const handleMove = (index, direction) => {
    const next = [...sections];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    const temp = next[index];
    next[index] = next[target];
    next[target] = temp;
    setSections(next);
  };

  const handleToggleHide = (index) => {
    const next = [...sections];
    next[index].hidden = !next[index].hidden;
    setSections(next);
  };

  const handleDelete = (index) => {
    if (window.confirm("Are you sure you want to delete this section?")) {
      setSections(sections.filter((_, i) => i !== index));
    }
  };

  const handleFieldChange = (index, field, value) => {
    const next = [...sections];
    next[index][field] = value;
    setSections(next);
  };

  const handleCardFieldChange = (secIdx, cardIdx, field, value) => {
    const next = [...sections];
    const cards = [...(next[secIdx].cards || [])];
    cards[cardIdx] = { ...cards[cardIdx], [field]: value };
    next[secIdx].cards = cards;
    setSections(next);
  };

  const handleAddCard = (secIdx) => {
    const next = [...sections];
    const cards = [...(next[secIdx].cards || [])];
    cards.push({
      id: `card_${Date.now()}`,
      title: "New Item / Card Title",
      description: "Enter card details or answer here.",
      icon: "✨",
      image_url: "",
      link_url: "",
    });
    next[secIdx].cards = cards;
    setSections(next);
  };

  const handleDeleteCard = (secIdx, cardIdx) => {
    const next = [...sections];
    const cards = [...(next[secIdx].cards || [])];
    cards.splice(cardIdx, 1);
    next[secIdx].cards = cards;
    setSections(next);
  };

  const handleAddSection = () => {
    const newSec = {
      id: `sec_custom_${Date.now()}`,
      type: "custom",
      name: "Custom Content Block",
      hidden: false,
      eyebrow: "Custom Section",
      title: "New Custom Title",
      body: "Add custom block text or items here.",
      cards: [],
    };
    setSections([...sections, newSec]);
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage("");
    try {
      await postAdmin("/page-builder", { sections });
      setMessage("Landing page layout, cards & uploaded media published live over WebSockets!");
    } catch (err) {
      setMessage(`Error publishing page layout: ${err.message || "Save failed"}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <AdminPageHeader
        eyebrow="Visual Page Builder & Device Asset Uploader"
        title="Landing Page Sections, Cards & Device Uploads"
        description="Reorder sections, upload images directly from your device, edit cards & questions. Synced with theme colors."
      >
        <button className="admin-button admin-button--secondary" onClick={handleAddSection}>
          <Plus size={15} />Add Section Block
        </button>
        <button
          className="admin-button admin-button--primary"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? <RefreshCw className="animate-spin" size={15} /> : <Save size={15} />}
          {saving ? "Publishing..." : "Publish Live Layout"}
        </button>
      </AdminPageHeader>

      {message && <div className="admin-alert">{message}</div>}

      <div style={{ display: "flex", flexDirection: "column", gap: "20px", marginTop: "16px" }}>
        {sections.map((sec, idx) => (
          <section
            key={sec.id || idx}
            className="admin-settings-panel"
            style={{
              opacity: sec.hidden ? 0.6 : 1,
              background: "var(--surface)",
              color: "var(--text)",
              border: "1px solid var(--line)",
              borderRadius: "12px",
              padding: "20px",
              boxShadow: "var(--shadow)",
            }}
          >
            <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px", pb: "12px", borderBottom: "1px solid var(--line)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ fontWeight: 800, fontSize: "15px", color: "var(--primary)" }}>#{idx + 1} {sec.name || sec.id}</span>
                {sec.hidden && (
                  <span style={{ fontSize: "10px", color: "var(--warning)", background: "var(--surface-muted)", padding: "2px 8px", borderRadius: "12px", fontWeight: "700", textTransform: "uppercase" }}>
                    Hidden
                  </span>
                )}
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <button
                  type="button"
                  onClick={() => setExpandedSection(expandedSection === idx ? null : idx)}
                  className="admin-button admin-button--secondary"
                  style={{ padding: "5px 10px", fontSize: "11px", display: "inline-flex", alignItems: "center", gap: "4px" }}
                  title="Toggle Cards Editor"
                >
                  {expandedSection === idx ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  <span>Cards ({sec.cards?.length || 0})</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleMove(idx, -1)}
                  disabled={idx === 0}
                  className="admin-button admin-button--secondary"
                  style={{ padding: "5px 8px" }}
                  title="Move Up"
                >
                  <ArrowUp size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => handleMove(idx, 1)}
                  disabled={idx === sections.length - 1}
                  className="admin-button admin-button--secondary"
                  style={{ padding: "5px 8px" }}
                  title="Move Down"
                >
                  <ArrowDown size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => handleToggleHide(idx)}
                  className="admin-button admin-button--secondary"
                  style={{ padding: "5px 8px" }}
                  title={sec.hidden ? "Unhide Section" : "Hide Section"}
                >
                  {sec.hidden ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(idx)}
                  className="admin-button admin-button--secondary"
                  style={{ padding: "5px 8px", color: "var(--danger)" }}
                  title="Delete Section"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </header>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "16px" }}>
              <label style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                <span style={{ fontSize: "11px", fontWeight: "700", color: "var(--text)", textTransform: "uppercase" }}>
                  Section Eyebrow Text
                </span>
                <input
                  type="text"
                  value={sec.eyebrow || ""}
                  onChange={(e) => handleFieldChange(idx, "eyebrow", e.target.value)}
                  placeholder="Built for real-time collaboration"
                  style={{ background: "var(--surface)", color: "var(--text)", border: "1px solid var(--line)", borderRadius: "6px", padding: "8px 12px", fontSize: "13px" }}
                />
              </label>

              <label style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                <span style={{ fontSize: "11px", fontWeight: "700", color: "var(--text)", textTransform: "uppercase" }}>
                  Section Headline
                </span>
                <input
                  type="text"
                  value={sec.title || ""}
                  onChange={(e) => handleFieldChange(idx, "title", e.target.value)}
                  style={{ background: "var(--surface)", color: "var(--text)", border: "1px solid var(--line)", borderRadius: "6px", padding: "8px 12px", fontSize: "13px" }}
                />
              </label>

              <label style={{ gridColumn: "span 2", display: "flex", flexDirection: "column", gap: "5px" }}>
                <span style={{ fontSize: "11px", fontWeight: "700", color: "var(--text)", textTransform: "uppercase" }}>
                  Subheadline / Description
                </span>
                <input
                  type="text"
                  value={sec.body || ""}
                  onChange={(e) => handleFieldChange(idx, "body", e.target.value)}
                  style={{ background: "var(--surface)", color: "var(--text)", border: "1px solid var(--line)", borderRadius: "6px", padding: "8px 12px", fontSize: "13px" }}
                />
              </label>

              <label style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                <span style={{ fontSize: "11px", fontWeight: "700", color: "var(--text)", textTransform: "uppercase" }}>
                  Primary CTA Label
                </span>
                <input
                  type="text"
                  value={sec.cta_text || ""}
                  onChange={(e) => handleFieldChange(idx, "cta_text", e.target.value)}
                  style={{ background: "var(--surface)", color: "var(--text)", border: "1px solid var(--line)", borderRadius: "6px", padding: "8px 12px", fontSize: "13px" }}
                />
              </label>

              <label style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                <span style={{ fontSize: "11px", fontWeight: "700", color: "var(--text)", textTransform: "uppercase" }}>
                  Primary CTA Target Link
                </span>
                <input
                  type="text"
                  value={sec.cta_link || ""}
                  onChange={(e) => handleFieldChange(idx, "cta_link", e.target.value)}
                  style={{ background: "var(--surface)", color: "var(--text)", border: "1px solid var(--line)", borderRadius: "6px", padding: "8px 12px", fontSize: "13px" }}
                />
              </label>

              <div style={{ gridColumn: "span 2" }}>
                <ImageUploaderInput
                  label="Graphic / Section Image"
                  value={sec.image_url}
                  onChange={(val) => handleFieldChange(idx, "image_url", val)}
                  placeholder="/images/hero-graphic.png or upload file..."
                />
              </div>
            </div>

            {/* Section Cards / Items Manager */}
            {(expandedSection === idx || (sec.cards && sec.cards.length > 0)) && (
              <div style={{ marginTop: "20px", paddingTop: "16px", borderTop: "1px solid var(--line)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
                  <h3 style={{ fontSize: "13px", fontWeight: "700", margin: 0, color: "var(--text)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                    Section Cards & Features ({sec.cards?.length || 0})
                  </h3>
                  <button
                    type="button"
                    onClick={() => handleAddCard(idx)}
                    className="admin-button admin-button--secondary"
                    style={{ fontSize: "11px", padding: "5px 12px" }}
                  >
                    <Plus size={13} />Add Card to Section
                  </button>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "14px" }}>
                  {(sec.cards || []).map((card, cIdx) => (
                    <div
                      key={card.id || cIdx}
                      style={{
                        padding: "14px",
                        borderRadius: "10px",
                        border: "1px solid var(--line)",
                        background: "var(--surface-muted)",
                        color: "var(--text)",
                        display: "flex",
                        flexDirection: "column",
                        gap: "10px",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: "11px", fontWeight: "800", color: "var(--primary)" }}>
                          Card #{cIdx + 1}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleDeleteCard(idx, cIdx)}
                          style={{ border: "none", background: "transparent", color: "var(--danger)", cursor: "pointer", padding: "2px" }}
                          title="Delete Card"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "70px 1fr", gap: "10px" }}>
                        <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                          <span style={{ fontSize: "10px", fontWeight: "700", color: "var(--muted)" }}>Icon/Emoji</span>
                          <input
                            type="text"
                            value={card.icon || ""}
                            onChange={(e) => handleCardFieldChange(idx, cIdx, "icon", e.target.value)}
                            style={{ background: "var(--surface)", color: "var(--text)", border: "1px solid var(--line)", borderRadius: "6px", padding: "6px 8px", fontSize: "13px" }}
                          />
                        </label>
                        <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                          <span style={{ fontSize: "10px", fontWeight: "700", color: "var(--muted)" }}>Card Title / Question</span>
                          <input
                            type="text"
                            value={card.title || card.question || ""}
                            onChange={(e) => {
                              handleCardFieldChange(idx, cIdx, "title", e.target.value);
                              handleCardFieldChange(idx, cIdx, "question", e.target.value);
                            }}
                            style={{ background: "var(--surface)", color: "var(--text)", border: "1px solid var(--line)", borderRadius: "6px", padding: "6px 8px", fontSize: "13px" }}
                          />
                        </label>
                      </div>

                      <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                        <span style={{ fontSize: "10px", fontWeight: "700", color: "var(--muted)" }}>Card Description / Answer</span>
                        <textarea
                          value={card.description || card.answer || ""}
                          onChange={(e) => {
                            handleCardFieldChange(idx, cIdx, "description", e.target.value);
                            handleCardFieldChange(idx, cIdx, "answer", e.target.value);
                          }}
                          style={{
                            minHeight: "55px",
                            fontSize: "12px",
                            background: "var(--surface)",
                            color: "var(--text)",
                            border: "1px solid var(--line)",
                            borderRadius: "6px",
                            padding: "6px 8px",
                            resize: "vertical",
                          }}
                        />
                      </label>

                      <ImageUploaderInput
                        label="Card Feature Image / Graphic"
                        value={card.image_url}
                        onChange={(val) => handleCardFieldChange(idx, cIdx, "image_url", val)}
                        placeholder="/images/feature.png or upload..."
                      />

                      {card.image_url && (
                        <div style={{ marginTop: "4px", borderRadius: "6px", overflow: "hidden", border: "1px solid var(--line)" }}>
                          <img
                            src={card.image_url}
                            alt="Preview"
                            onError={(e) => { e.currentTarget.style.display = "none"; }}
                            style={{ width: "100%", height: "70px", objectFit: "cover", display: "block" }}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        ))}
      </div>
    </>
  );
}
