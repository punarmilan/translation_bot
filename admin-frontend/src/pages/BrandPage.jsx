import React, { useEffect, useState } from "react";
import { fetchAdmin, patchAdmin } from "../services/api";
import AdminPageHeader from "../components/AdminPageHeader";
import { Save, Check, RefreshCw } from "lucide-react";

export default function BrandPage() {
  const [form, setForm] = useState({
    product_name: "VOXO",
    site_title: "VOXO — Real-Time Multilingual Platform",
    logo_url: "",
    favicon_url: "",
    og_image: "",
    twitter_card: "",
    meta_description: "Meet, speak, and collaborate in any language instantly with self-hosted AI voice translation.",
    seo_keywords: "multilingual meeting, voice translation, whisper stt, piper tts, self-hosted AI, webrtc",
    accent_color: "#3B82F6",
    primary_color: "#0F172A",
    secondary_color: "#1E293B",
    font_family: "Inter, system-ui, sans-serif",
    border_radius: "0.75rem",
    button_style: "glass",
    footer_text: "Meet, speak, and collaborate across languages.",
    copyright_text: "© 2026 VOXO by WorknAI Technologies India Pvt. Ltd. All rights reserved.",
    company_name: "WorknAI Technologies India Pvt. Ltd.",
    company_email: "support@worknai.tech",
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetchAdmin("/settings/branding")
      .then((res) => {
        if (res.values) {
          setForm((prev) => ({ ...prev, ...res.values }));
        }
      })
      .catch((err) => console.warn("Failed to load branding settings", err));
  }, []);

  const handleChange = (key, val) => {
    setForm((prev) => ({ ...prev, [key]: val }));
  };

  const handleSave = async (e) => {
    if (e) e.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      await patchAdmin("/settings/branding", { values: form });
      setMessage("Branding & design system tokens updated! Broadcasted live over WebSockets.");
    } catch (err) {
      setMessage(`Error updating branding: ${err.message || "Save failed"}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <AdminPageHeader
        eyebrow="Brand Management & Design System"
        title="Platform Identity & Live Styling"
        description="Every change made here updates connected clients in real time via WebSockets with zero browser refresh."
      >
        <button
          className="admin-button admin-button--primary"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? <RefreshCw className="animate-spin" size={15} /> : <Save size={15} />}
          {saving ? "Broadcasting..." : "Save & Broadcast Live"}
        </button>
      </AdminPageHeader>

      {message && <div className="admin-alert">{message}</div>}

      <div style={{ display: "flex", flexDirection: "column", gap: "24px", marginTop: "16px" }}>
        {/* Panel 1: Brand & SEO Identity */}
        <section className="admin-settings-panel">
          <header>
            <span>Platform Metadata</span>
            <h2>Brand Identity & SEO Metadata</h2>
          </header>
          <div className="admin-form-grid">
            <label>
              <span>Product Name</span>
              <input
                type="text"
                value={form.product_name}
                onChange={(e) => handleChange("product_name", e.target.value)}
              />
            </label>
            <label>
              <span>Browser Title Tag</span>
              <input
                type="text"
                value={form.site_title}
                onChange={(e) => handleChange("site_title", e.target.value)}
              />
            </label>
            <label style={{ gridColumn: "span 2" }}>
              <span>Meta Description</span>
              <input
                type="text"
                value={form.meta_description}
                onChange={(e) => handleChange("meta_description", e.target.value)}
              />
            </label>
            <label style={{ gridColumn: "span 2" }}>
              <span>SEO Keywords (Comma Separated)</span>
              <input
                type="text"
                value={form.seo_keywords}
                onChange={(e) => handleChange("seo_keywords", e.target.value)}
              />
            </label>
          </div>
        </section>

        {/* Panel 2: Logos & Asset Links */}
        <section className="admin-settings-panel">
          <header>
            <span>Visual Assets</span>
            <h2>Logos, Favicon & Social Cards</h2>
          </header>
          <div className="admin-form-grid">
            <label>
              <span>Logo URL / Path</span>
              <input
                type="text"
                value={form.logo_url}
                onChange={(e) => handleChange("logo_url", e.target.value)}
                placeholder="/images/logo.png or https://cdn.voxo.ai/logo.png"
              />
            </label>
            <label>
              <span>Favicon URL / Path</span>
              <input
                type="text"
                value={form.favicon_url}
                onChange={(e) => handleChange("favicon_url", e.target.value)}
                placeholder="/favicon.ico or https://cdn.voxo.ai/favicon.ico"
              />
            </label>
            <label>
              <span>Open Graph Image (OG Card)</span>
              <input
                type="text"
                value={form.og_image}
                onChange={(e) => handleChange("og_image", e.target.value)}
                placeholder="https://cdn.voxo.ai/og-card.png"
              />
            </label>
            <label>
              <span>Twitter Card Banner</span>
              <input
                type="text"
                value={form.twitter_card}
                onChange={(e) => handleChange("twitter_card", e.target.value)}
                placeholder="https://cdn.voxo.ai/twitter-card.png"
              />
            </label>
          </div>
        </section>

        {/* Panel 3: Dynamic CSS Design Tokens & Colors */}
        <section className="admin-settings-panel">
          <header>
            <span>Live Design Tokens</span>
            <h2>Dynamic CSS Theme & Colors</h2>
          </header>
          <div className="admin-form-grid">
            <label>
              <span>Accent Color (Hex / HSL)</span>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <input
                  type="color"
                  value={form.accent_color.startsWith("#") ? form.accent_color : "#3B82F6"}
                  onChange={(e) => handleChange("accent_color", e.target.value)}
                  style={{ width: "36px", height: "36px", padding: 0, cursor: "pointer", border: "none" }}
                />
                <input
                  type="text"
                  value={form.accent_color}
                  onChange={(e) => handleChange("accent_color", e.target.value)}
                />
              </div>
            </label>

            <label>
              <span>Primary Background Color</span>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <input
                  type="color"
                  value={form.primary_color.startsWith("#") ? form.primary_color : "#0F172A"}
                  onChange={(e) => handleChange("primary_color", e.target.value)}
                  style={{ width: "36px", height: "36px", padding: 0, cursor: "pointer", border: "none" }}
                />
                <input
                  type="text"
                  value={form.primary_color}
                  onChange={(e) => handleChange("primary_color", e.target.value)}
                />
              </div>
            </label>

            <label>
              <span>Secondary Surface Color</span>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <input
                  type="color"
                  value={form.secondary_color.startsWith("#") ? form.secondary_color : "#1E293B"}
                  onChange={(e) => handleChange("secondary_color", e.target.value)}
                  style={{ width: "36px", height: "36px", padding: 0, cursor: "pointer", border: "none" }}
                />
                <input
                  type="text"
                  value={form.secondary_color}
                  onChange={(e) => handleChange("secondary_color", e.target.value)}
                />
              </div>
            </label>

            <label>
              <span>Font Family</span>
              <input
                type="text"
                value={form.font_family}
                onChange={(e) => handleChange("font_family", e.target.value)}
              />
            </label>

            <label>
              <span>Border Radius</span>
              <input
                type="text"
                value={form.border_radius}
                onChange={(e) => handleChange("border_radius", e.target.value)}
              />
            </label>

            <label>
              <span>Button Style</span>
              <select
                value={form.button_style}
                onChange={(e) => handleChange("button_style", e.target.value)}
              >
                <option value="glass">Glassmorphism Blur</option>
                <option value="solid">Solid Accent</option>
                <option value="flat">Flat Minimal</option>
              </select>
            </label>
          </div>
        </section>

        {/* Panel 4: Company & Legal Copy */}
        <section className="admin-settings-panel">
          <header>
            <span>Legal & Ownership</span>
            <h2>Company Information & Footer Copy</h2>
          </header>
          <div className="admin-form-grid">
            <label>
              <span>Company Legal Name</span>
              <input
                type="text"
                value={form.company_name}
                onChange={(e) => handleChange("company_name", e.target.value)}
              />
            </label>
            <label>
              <span>Support Contact Email</span>
              <input
                type="email"
                value={form.company_email}
                onChange={(e) => handleChange("company_email", e.target.value)}
              />
            </label>
            <label style={{ gridColumn: "span 2" }}>
              <span>Footer Tagline</span>
              <input
                type="text"
                value={form.footer_text}
                onChange={(e) => handleChange("footer_text", e.target.value)}
              />
            </label>
            <label style={{ gridColumn: "span 2" }}>
              <span>Copyright Notice</span>
              <input
                type="text"
                value={form.copyright_text}
                onChange={(e) => handleChange("copyright_text", e.target.value)}
              />
            </label>
          </div>
        </section>
      </div>
    </>
  );
}
