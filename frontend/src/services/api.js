import axios from "axios";

const API_HOST = window.location.hostname || "localhost";
const API_PROTOCOL = window.location.protocol === "https:" ? "https" : "http";
export const BASE_URL =
  import.meta.env.VITE_API_BASE_URL || `${API_PROTOCOL}://${API_HOST}:8000`;

export const ACCESS_TOKEN_KEY = "access_token";
export const REFRESH_TOKEN_KEY = "refresh_token";

const client = axios.create({ baseURL: BASE_URL });

client.interceptors.request.use((config) => {
  const token = localStorage.getItem(ACCESS_TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Access tokens expire (60 minutes by default -- see backend/app/config.py's
// ACCESS_TOKEN_EXPIRE_MINUTES); refresh_token was previously returned by
// /auth/login but silently discarded by the frontend, so there was no way to
// renew a session without a full re-login. This mirrors the admin frontend's
// existing refresh-on-401 interceptor (services/api.js there), adapted for
// this app's Bearer-token (not cookie) auth: on a 401 that isn't from the
// auth endpoints themselves, exchange the stored refresh token for a new
// pair once, update the failed request's Authorization header, and retry it
// exactly once. A single in-flight refresh is shared across concurrent 401s
// so a burst of requests doesn't each trigger their own refresh call.
let refreshPromise = null;

client.interceptors.response.use(
  (response) => response,
  async (error) => {
    const request = error.config;
    const isAuthRequest = request?.url?.includes("/auth/login")
      || request?.url?.includes("/auth/signup")
      || request?.url?.includes("/auth/refresh")
      || request?.url?.includes("/auth/forgot-password")
      || request?.url?.includes("/auth/reset-password");
    const storedRefreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);

    if (error.response?.status !== 401 || request?._retried || isAuthRequest || !storedRefreshToken) {
      return Promise.reject(error);
    }
    request._retried = true;

    refreshPromise ||= client
      .post("/auth/refresh", { refresh_token: storedRefreshToken })
      .then(({ data }) => {
        localStorage.setItem(ACCESS_TOKEN_KEY, data.access_token);
        if (data.refresh_token) localStorage.setItem(REFRESH_TOKEN_KEY, data.refresh_token);
        return data;
      })
      .finally(() => { refreshPromise = null; });

    try {
      const refreshed = await refreshPromise;
      request.headers = request.headers || {};
      request.headers.Authorization = `Bearer ${refreshed.access_token}`;
      return client(request);
    } catch {
      localStorage.removeItem(ACCESS_TOKEN_KEY);
      localStorage.removeItem(REFRESH_TOKEN_KEY);
      window.dispatchEvent(new CustomEvent("session-expired"));
      return Promise.reject(error);
    }
  },
);

/**
 * Extracts a human-readable message from an axios error.
 * Handles FastAPI 422 validation arrays and plain string detail fields.
 */
export function parseApiError(err) {
  const detail = err?.response?.data?.detail;
  if (Array.isArray(detail)) {
    return detail
      .map((e) => {
        const field = e.loc?.slice(-1)[0];
        const message = String(e.msg || "Invalid value").replace(/^Value error,\s*/i, "");
        return field && field !== "body" ? `${field}: ${message}` : message;
      })
      .join(", ");
  }
  if (typeof detail === "string") return detail;
  if (err?.response?.data?.message) return err.response.data.message;
  if (err?.response?.status) return `Request failed with status ${err.response.status}`;
  if (err?.code === "ERR_NETWORK") {
    return window.location.protocol === "https:"
      ? "Could not securely reach the backend. Open port 8000 in this browser and accept the local certificate first."
      : "Could not reach the backend. Make sure FastAPI is running on port 8000.";
  }
  if (err?.message) return err.message;
  return null;
}

export async function signup({
  name,
  email,
  password,
  role,
  preferred_language,
  pronouns,
  voice_preference,
}) {
  const { data } = await client.post("/auth/signup", {
    name,
    email,
    password,
    role: role || "participant",
    preferred_language: preferred_language || "en",
    pronouns: pronouns || null,
    voice_preference: voice_preference || "auto",
  });
  return data;
}

export async function login(email, password) {
  const { data } = await client.post("/auth/login", { email, password });
  return data;
}

export async function forgotPassword(email) {
  const { data } = await client.post("/auth/forgot-password", { email });
  return data;
}

export async function resetPassword(token, newPassword) {
  const { data } = await client.post("/auth/reset-password", {
    token,
    new_password: newPassword,
  });
  return data;
}

export async function getMe() {
  const { data } = await client.get("/auth/me");
  return data;
}

export async function updateMe({ preferred_language, pronouns, voice_preference }) {
  const { data } = await client.put("/auth/me", {
    preferred_language,
    pronouns: pronouns || null,
    voice_preference: voice_preference || "auto",
  });
  return data;
}

export async function getRoomMessages(roomId, limit = 50) {
  const { data } = await client.get(`/rooms/${roomId}/messages?limit=${limit}`);
  return data;
}

export async function getSttStatus() {
  const { data } = await client.get("/stt/status");
  return data;
}

export async function getIceServers() {
  const { data } = await client.get("/webrtc/ice-servers");
  return data;
}

export async function warmupStt() {
  const { data } = await client.post("/stt/warmup");
  return data;
}

export async function synthesizeTts(
  text,
  language,
  voice_preference = "auto",
  speech_profile = "natural"
) {
  const { data } = await client.post("/tts/synthesize", {
    text,
    language,
    voice_preference,
    speech_profile,
  });
  return data;
}

export async function getFeatureFlags() {
  const { data } = await client.get("/api/public/feature-flags");
  return data;
}

export async function getPublicLanguages() {
  const { data } = await client.get("/api/public/languages");
  return data;
}

export async function getTranslationModes() {
  const { data } = await client.get("/api/public/translation-modes");
  return data;
}

export async function getPublicContent() {
  const { data } = await client.get("/api/public/content");
  return data;
}

// Generic CMS (Phase 1/2 foundation): fetches a page's published sections.
export async function getCmsPage(page) {
  const { data } = await client.get(`/api/public/cms/pages/${encodeURIComponent(page)}`);
  return data;
}

// Draft (unpublished) sections for exactly one page, gated by a short-lived
// token minted by the admin console -- used by the /preview/:page route.
export async function getCmsPagePreview(page, token) {
  const { data } = await client.get(`/api/public/cms/pages/${encodeURIComponent(page)}/preview`, { params: { token } });
  return data;
}

export function resolveImageUrl(url) {
  if (!url) return "";
  if (url.startsWith("/admin-media/")) {
    return `${BASE_URL}${url}`;
  }
  return url;
}




