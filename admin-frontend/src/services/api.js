import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_ADMIN_API_URL || "http://127.0.0.1:8010",
  timeout: 12000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("admin_access_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export async function adminLogin(email, password) {
  return (await api.post("/admin/auth/login", { email, password })).data;
}

export async function verifyAdmin() {
  return (await api.get("/admin/auth/verify")).data;
}

export async function getDashboard() {
  return (await api.get("/admin/dashboard")).data;
}

export async function getUsers(params) {
  return (await api.get("/admin/users", { params })).data;
}

export async function updateUser(userId, changes) {
  return (await api.patch(`/admin/users/${userId}`, changes)).data;
}

export async function userAction(userId, action) {
  if (action === "delete") return (await api.delete(`/admin/users/${userId}`)).data;
  return (await api.post(`/admin/users/${userId}/${action}`)).data;
}

export async function getMeetings(params) {
  return (await api.get("/admin/meetings", { params })).data;
}

export async function meetingAction(roomId, action, body = {}) {
  return (await api.post(`/admin/meetings/${roomId}/${action}`, body)).data;
}

export async function getModule(module) {
  return (await api.get(`/admin/${module}`)).data;
}

export default api;
