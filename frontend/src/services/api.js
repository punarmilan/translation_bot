import axios from "axios";

const BASE_URL = "http://192.168.1.53:8000";

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
    return "Could not reach the backend. Make sure FastAPI is running on localhost:8000.";
  }
  if (err?.message) return err.message;
  return null;
}

export async function signup(username, email, password, role, preferred_language) {
  const { data } = await client.post("/auth/signup", {
    username,
    email,
    password,
    role: role || "participant",
    preferred_language: preferred_language || "en",
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

export async function getRoomMessages(roomId, limit = 50) {
  const { data } = await client.get(`/rooms/${roomId}/messages?limit=${limit}`);
  return data;
}

export async function getAdminUsers() {
  const { data } = await client.get("/auth/users");
  return data;
}

export async function getAllRoomStats() {
  const { data } = await client.get("/rooms/stats");
  return data;
}
