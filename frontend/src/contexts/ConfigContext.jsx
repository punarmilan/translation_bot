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

  const applyThemeTokens = (b) => {
    if (!b) return;
    const root = document.documentElement;
    if (b.accent_color) root.style.setProperty("--color-accent", b.accent_color);
    if (b.primary_color) root.style.setProperty("--color-primary", b.primary_color);
    if (b.secondary_color) root.style.setProperty("--color-secondary", b.secondary_color);
    if (b.font_family) root.style.setProperty("--font-family", b.font_family);
    if (b.border_radius) root.style.setProperty("--border-radius", b.border_radius);

    if (b.site_title) {
      document.title = b.site_title;
    }
    if (b.favicon_url) {
      let iconLink = document.querySelector("link[rel~='icon']");
      if (!iconLink) {
        iconLink = document.createElement("link");
        iconLink.rel = "icon";
        document.getElementsByTagName("head")[0].appendChild(iconLink);
      }
      iconLink.href = b.favicon_url;
    }
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
