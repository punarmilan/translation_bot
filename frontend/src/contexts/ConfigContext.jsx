import React, { createContext, useContext, useEffect, useState } from "react";
import { getPublicContent, getFeatureFlags } from "../services/api";

const ConfigContext = createContext({
  branding: {},
  settings: {},
  featureFlags: {},
  sections: [],
  loading: true,
  refetchConfig: () => { },
});

export function ConfigProvider({ children }) {
  const [branding, setBranding] = useState({
    product_name: "VOXO",
    site_title: "VOXO — Real-Time Multilingual Platform",
    logo_url: "",
    logo_dark_url: "",
    favicon_url: "",
    favicon_dark_url: "",
    og_image: "",
    twitter_card: "",
    meta_description: "Meet, speak, and collaborate in any language instantly with self-hosted AI voice translation.",
    seo_keywords: "multilingual meeting, voice translation, whisper stt, piper tts, self-hosted AI, webrtc",
    accent_color: "#3B82F6",
    primary_color: "#0F172A",
    secondary_color: "#1E293B",
    font_family: "Inter, system-ui, sans-serif",
    heading_font_family: "",
    border_radius: "0.75rem",
    button_style: "glass",
    footer_text: "Meet, speak, and collaborate across languages.",
    copyright_text: "© 2026 VOXO by WorknAI Technologies India Pvt. Ltd. All rights reserved.",
    company_name: "WorknAI Technologies India Pvt. Ltd.",
    company_email: "support@worknai.tech",
    company_website: "",
    social_twitter: "",
    social_linkedin: "",
    social_github: "",
    social_youtube: "",
  });
  const [settings, setSettings] = useState({});
  const [featureFlags, setFeatureFlags] = useState({
    video_calling: true,
    voice_translation: true,
    live_captions: true,
    recording: true,
    screen_sharing: true,
    meeting_summary: true,
    stt: true,
    tts: true,
    whiteboard: true,
    files: true,
    meeting_notes: true,
    ai_summary: true,
    diagnostics: true,
    blogs: true,
    payments: false,
    invitations: true,
    waiting_room: true,
    moderator_controls: true,
    breakout_rooms: false,
    reactions: true,
    captions: true,
  });
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(true);

  // Finds-or-creates a <meta> tag by name or property attribute and sets its
  // content -- lets Global Site Settings (branding.meta_description, OG/Twitter
  // fields) override the static defaults baked into index.html without a new
  // CMS system, since these fields already exist and are already fetched above.
  const setMetaTag = (attr, key, content) => {
    if (!content) return;
    let tag = document.querySelector(`meta[${attr}='${key}']`);
    if (!tag) {
      tag = document.createElement("meta");
      tag.setAttribute(attr, key);
      document.getElementsByTagName("head")[0].appendChild(tag);
    }
    tag.setAttribute("content", content);
  };

  // Overrides brand background/surface colors for dark mode only -- these
  // CSS vars share the exact same :root defaults as light mode until a
  // [data-theme="dark"] rule redefines them (see styles.css), so writing an
  // inline style on <html> (which always wins regardless of theme) would
  // force the admin's colors onto light mode too and visibly break it. A
  // scoped <style data-theme="dark"> rule respects the existing cascade.
  const applyDarkThemeColors = (b) => {
    let tag = document.getElementById("branding-dark-theme-overrides");
    const declarations = [];
    if (b.primary_color) declarations.push(`--color-bg-primary: ${b.primary_color};`);
    if (b.secondary_color) declarations.push(`--color-surface: ${b.secondary_color};`);
    if (declarations.length === 0) {
      tag?.remove();
      return;
    }
    if (!tag) {
      tag = document.createElement("style");
      tag.id = "branding-dark-theme-overrides";
      document.getElementsByTagName("head")[0].appendChild(tag);
    }
    tag.textContent = `[data-theme="dark"] { ${declarations.join(" ")} }`;
  };

  // Two <link rel="icon"> tags with a prefers-color-scheme media query let
  // the browser pick automatically (favicons render against the OS/browser
  // chrome, not this site's own theme toggle) -- falls back to a single
  // theme-agnostic tag when no dark variant is configured, matching the
  // previous behavior exactly.
  const applyFavicon = (faviconUrl, faviconDarkUrl) => {
    if (!faviconUrl) return;
    document.querySelectorAll("link[data-branding-favicon]").forEach((el) => el.remove());
    const makeLink = (href, media) => {
      const link = document.createElement("link");
      link.rel = "icon";
      link.href = href;
      link.dataset.brandingFavicon = "true";
      if (media) link.media = media;
      document.getElementsByTagName("head")[0].appendChild(link);
    };
    if (faviconDarkUrl) {
      makeLink(faviconUrl, "(prefers-color-scheme: light)");
      makeLink(faviconDarkUrl, "(prefers-color-scheme: dark)");
    } else {
      makeLink(faviconUrl);
    }
  };

  const applyThemeTokens = (b) => {
    if (!b) return;
    const root = document.documentElement;
    if (b.accent_color) root.style.setProperty("--color-accent", b.accent_color);
    if (b.font_family) root.style.setProperty("--font-family", b.font_family);
    if (b.border_radius) root.style.setProperty("--radius-panel", b.border_radius);
    applyDarkThemeColors(b);

    if (b.site_title) {
      document.title = b.site_title;
    }
    applyFavicon(b.favicon_url, b.favicon_dark_url);

    setMetaTag("name", "description", b.meta_description);
    setMetaTag("name", "keywords", b.seo_keywords);
    setMetaTag("property", "og:title", b.site_title);
    setMetaTag("property", "og:description", b.meta_description);
    setMetaTag("property", "og:image", b.og_image);
    setMetaTag("name", "twitter:card", b.twitter_card);
    setMetaTag("name", "twitter:title", b.site_title);
    setMetaTag("name", "twitter:description", b.meta_description);
    setMetaTag("name", "twitter:image", b.og_image);
  };

  const fetchConfig = async () => {
    try {
      const apiHost = window.location.hostname || "localhost";
      const apiBase = import.meta.env.VITE_API_BASE_URL || `http://${apiHost}:8000`;

      const [brandRes, flagsRes, pageRes, settingsRes] = await Promise.allSettled([
        fetch(`${apiBase}/api/public/branding`).then((r) => r.json()),
        getFeatureFlags(),
        fetch(`${apiBase}/api/public/page-builder`).then((r) => r.json()),
        fetch(`${apiBase}/api/public/settings`).then((r) => r.json()),
      ]);

      if (brandRes.status === "fulfilled" && brandRes.value?.branding) {
        setBranding((prev) => {
          const next = { ...prev, ...brandRes.value.branding };
          applyThemeTokens(next);
          return next;
        });
      }
      if (flagsRes.status === "fulfilled" && flagsRes.value?.features) {
        setFeatureFlags((prev) => ({ ...prev, ...flagsRes.value.features }));
      }
      if (pageRes.status === "fulfilled" && pageRes.value?.sections) {
        setSections(pageRes.value.sections);
      }
      if (settingsRes.status === "fulfilled" && settingsRes.value?.values) {
        setSettings(settingsRes.value.values);
      }
    } catch (err) {
      console.warn("Config fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  // Listen to WebSocket custom event dispatches
  useEffect(() => {
    const handleSystemConfig = (e) => {
      const payload = e.detail;
      if (!payload) return;
      if (payload.branding) {
        setBranding((prev) => {
          const next = { ...prev, ...payload.branding };
          applyThemeTokens(next);
          return next;
        });
      }
      if (payload.features) {
        setFeatureFlags((prev) => ({ ...prev, ...payload.features }));
      }
      if (payload.general) {
        setSettings((prev) => ({ ...prev, ...payload.general }));
      }
      if (payload.landing_sections) {
        setSections(payload.landing_sections);
      }
    };

    window.addEventListener("voxo_system_config", handleSystemConfig);
    return () => window.removeEventListener("voxo_system_config", handleSystemConfig);
  }, []);

  return (
    <ConfigContext.Provider
      value={{
        branding,
        settings,
        featureFlags,
        sections,
        loading,
        refetchConfig: fetchConfig,
      }}
    >
      {children}
    </ConfigContext.Provider>
  );
}

export function useConfig() {
  return useContext(ConfigContext);
}
