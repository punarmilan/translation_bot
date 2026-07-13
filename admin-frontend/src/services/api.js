import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_ADMIN_API_URL || "",
  timeout: 15000,
  withCredentials: true,
});

let refreshPromise = null;

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const request = error.config;
    const isAuthRequest = request?.url?.includes("/api/admin/auth/");
    if (error.response?.status !== 401 || request?._retried || isAuthRequest) {
      return Promise.reject(error);
    }
    request._retried = true;
    refreshPromise ||= api.post("/api/admin/auth/refresh").finally(() => { refreshPromise = null; });
    try {
      await refreshPromise;
      return api(request);
    } catch {
      window.dispatchEvent(new CustomEvent("admin-session-expired"));
      return Promise.reject(error);
    }
  },
);

export async function adminLogin(email, password) {
  return (await api.post("/api/admin/auth/login", { email, password })).data;
}

export async function getAdminRegistrationStatus() {
  return (await api.get("/api/admin/auth/registration-status")).data;
}

export async function registerAdmin(body) {
  return (await api.post("/api/admin/auth/register", body)).data;
}

export async function createAdminInvitation(body) {
  return (await api.post("/api/admin/auth/invitations", body)).data;
}

export async function verifyAdmin() {
  return (await api.get("/api/admin/auth/session")).data;
}

export async function adminLogout() {
  await api.post("/api/admin/auth/logout");
}

export async function getDashboard() {
  return (await api.get("/api/admin/dashboard")).data;
}

export async function getUsers(params) {
  return (await api.get("/api/admin/users", { params })).data;
}

export async function createUser(body) {
  return (await api.post("/api/admin/users", body)).data;
}

export async function getUserActivity(userId) {
  return (await api.get(`/api/admin/users/${userId}/activity`)).data;
}

export async function exportUsers(params) {
  return (await api.get("/api/admin/users/export.csv", { params, responseType: "blob" })).data;
}

export async function updateUser(userId, changes) {
  return (await api.patch(`/api/admin/users/${userId}`, changes)).data;
}

export async function userAction(userId, action) {
  if (action === "delete") return (await api.delete(`/api/admin/users/${userId}`)).data;
  return (await api.post(`/api/admin/users/${userId}/${action}`)).data;
}

export async function getMeetings(params) {
  return (await api.get("/api/admin/meetings", { params })).data;
}

export async function meetingAction(roomId, action, body = {}) {
  return (await api.post(`/api/admin/meetings/${roomId}/${action}`, body)).data;
}

export async function issueMeetingCommand(roomId, body) {
  return (await api.post(`/api/admin/meetings/${roomId}/command`, body)).data;
}

export async function exportMeeting(roomId) {
  return (await api.get(`/api/admin/meetings/${encodeURIComponent(roomId)}/export`)).data;
}

export async function getMeetingLogs(roomId) {
  return (await api.get(`/api/admin/meetings/${encodeURIComponent(roomId)}/logs`)).data;
}

export async function getModule(module, params) {
  return (await api.get(`/api/admin/${module}`, { params })).data;
}

export async function exportAuditLogs(params) {
  return (await api.get("/api/admin/logs/export.csv", { params, responseType: "blob" })).data;
}

export async function createModuleItem(module, body) {
  return (await api.post(`/api/admin/${module}`, body)).data;
}

export async function updateModuleItem(module, itemId, body) {
  return (await api.patch(`/api/admin/${module}/${itemId}`, body)).data;
}

export async function deleteModuleItem(module, itemId) {
  return (await api.delete(`/api/admin/${module}/${itemId}`)).data;
}

export async function updateModuleSettings(module, values) {
  return (await api.patch(`/api/admin/${module}`, { values })).data;
}

export async function updateRole(key, values) {
  return (await api.patch(`/api/admin/roles/${key}`, { values })).data;
}

export async function createRole(body) {
  return (await api.post("/api/admin/roles", body)).data;
}

export async function deleteRole(key) {
  return (await api.delete(`/api/admin/roles/${key}`)).data;
}

export async function uploadMedia(formData) {
  return (await api.post("/api/admin/media", formData)).data;
}

export async function replaceMedia(mediaId, formData) {
  return (await api.put(`/api/admin/media/${mediaId}/file`, formData)).data;
}

export async function transformMedia(mediaId, body) {
  return (await api.post(`/api/admin/media/${mediaId}/transform`, body)).data;
}

export async function updateMedia(mediaId, body) {
  return (await api.patch(`/api/admin/media/${mediaId}`, body)).data;
}

export async function getMeetingParticipants(roomId) {
  return (await api.get(`/api/admin/meetings/${encodeURIComponent(roomId)}/participants`)).data;
}

export default api;
