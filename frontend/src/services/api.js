import axios from "axios";

const API_HOST = window.location.hostname || "localhost";
const API_PROTOCOL = window.location.protocol === "https:" ? "https" : "http";
export const BASE_URL =
  import.meta.env.VITE_API_BASE_URL || `${API_PROTOCOL}://${API_HOST}:8000`;

const client = axios.create({ baseURL: BASE_URL });

client.interceptors.request.use((config) => {
  const token = localStorage.getItem("access_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

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

export async function getPublicContent() {
  const { data } = await client.get("/api/public/content");
  return data;
}

