import React, { useEffect, useState } from "react";
import { fetchAdmin, postAdmin } from "../services/api";
import AdminPageHeader from "../components/AdminPageHeader";
import { ArrowDown, ArrowUp, Eye, EyeOff, Plus, Save, Trash2, Layers, RefreshCw } from "lucide-react";

const DEFAULT_SECTIONS = [
  { id: "sec_hero", type: "hero", name: "Hero Section", hidden: false, title: "Meet, speak, and collaborate in any language instantly", body: "VOXO translates live voice, captions, and chat naturally without cloud tracking.", cta_text: "Get Started Free", cta_link: "/signup" },
  { id: "sec_benefits", type: "benefits", name: "Core Benefits (Meetings designed around human connection)", hidden: false, title: "Meetings designed around human connection", body: "Speak naturally, collaborate seamlessly, and keep voice data self-hosted." },
  { id: "sec_showcase", type: "showcase", name: "Dynamic Marquee Showcase", hidden: false, title: "Powering multilingual meetings anywhere", body: "Real-time speech-to-speech, live captions, notes, and whiteboard canvas." },
  { id: "sec_testimonials", type: "testimonials", name: "Executive Testimonials", hidden: false, title: "Trusted by teams communicating across borders", body: "Proven impact across global education, enterprises, and healthcare." },
  { id: "sec_faq", type: "faq", name: "FAQ Section", hidden: false, title: "Questions before your first meeting", body: "Practical answers about setup, languages, and security." },
  { id: "sec_cta", type: "cta", name: "Bottom CTA Banner", hidden: false, title: "Ready to Remove Language Barriers with VOXO?", body: "Start your first meeting today." },
];

export default function PageBuilderPage() {
  const [sections, setSections] = useState(DEFAULT_SECTIONS);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

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

  const handleAddSection = () => {
    const newSec = {
      id: `sec_custom_${Date.now()}`,
      type: "custom",
      name: "Custom Content Block",
      hidden: false,
      title: "New Custom Section",
      body: "Add your custom announcement or markdown details here.",
    };
    setSections([...sections, newSec]);
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage("");
    try {
      await postAdmin("/page-builder", { sections });
      setMessage("Landing page layout & sections published live over WebSockets!");
    } catch (err) {
      setMessage(`Error publishing page layout: ${err.message || "Save failed"}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <AdminPageHeader
        eyebrow="Visual Page Builder & CMS"
        title="Landing Page Sections & Order"
        description="Reorder, hide, edit headlines, or add custom blocks. Changes broadcast live instantly."
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
            style={{ opacity: sec.hidden ? 0.6 : 1 }}
          >
            <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", itemsCenter: "center", gap: "10px" }}>
                <span style={{ fontWeight: 800 }}>#{idx + 1} {sec.name || sec.id}</span>
                {sec.hidden && <span style={{ fontSize: "11px", color: "var(--muted)", textTransform: "uppercase" }}>(Hidden)</span>}
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <button
                  type="button"
                  onClick={() => handleMove(idx, -1)}
                  disabled={idx === 0}
                  className="admin-button admin-button--secondary"
                  style={{ padding: "4px 8px" }}
                  title="Move Up"
                >
                  <ArrowUp size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => handleMove(idx, 1)}
                  disabled={idx === sections.length - 1}
                  className="admin-button admin-button--secondary"
                  style={{ padding: "4px 8px" }}
                  title="Move Down"
                >
                  <ArrowDown size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => handleToggleHide(idx)}
                  className="admin-button admin-button--secondary"
                  style={{ padding: "4px 8px" }}
                  title={sec.hidden ? "Unhide Section" : "Hide Section"}
                >
                  {sec.hidden ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(idx)}
                  className="admin-button admin-button--secondary"
                  style={{ padding: "4px 8px", color: "#f87171" }}
                  title="Delete Section"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </header>

            <div className="admin-form-grid">
              <label>
                <span>Section Headline</span>
                <input
                  type="text"
                  value={sec.title || ""}
                  onChange={(e) => handleFieldChange(idx, "title", e.target.value)}
                />
              </label>

              <label>
                <span>Subheadline / Description</span>
                <input
                  type="text"
                  value={sec.body || ""}
                  onChange={(e) => handleFieldChange(idx, "body", e.target.value)}
                />
              </label>

              {sec.type === "hero" && (
                <>
                  <label>
                    <span>Primary CTA Button Label</span>
                    <input
                      type="text"
                      value={sec.cta_text || ""}
                      onChange={(e) => handleFieldChange(idx, "cta_text", e.target.value)}
                    />
                  </label>
                  <label>
                    <span>Primary CTA Target Link</span>
                    <input
                      type="text"
                      value={sec.cta_link || ""}
                      onChange={(e) => handleFieldChange(idx, "cta_link", e.target.value)}
                    />
                  </label>
                </>
              )}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
