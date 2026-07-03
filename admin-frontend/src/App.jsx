import { Navigate, Route, Routes } from "react-router-dom";
import AdminLayout from "./components/AdminLayout";
import ProtectedAdminRoute from "./components/ProtectedAdminRoute";
import DashboardPage from "./pages/DashboardPage";
import ForbiddenPage from "./pages/ForbiddenPage";
import LoginPage from "./pages/LoginPage";
import MeetingsPage from "./pages/MeetingsPage";
import PlaceholderPage from "./pages/PlaceholderPage";
import UsersPage from "./pages/UsersPage";

const placeholders = [
  ["content", "Content", "Editorial and help content management will be introduced in a later milestone."],
  ["media", "Media", "Media uploads and asset management are intentionally not implemented yet."],
  ["languages", "Languages", "Review configured meeting languages. Provider configuration remains read-only."],
  ["voices", "Voice Models", "Voice model uploads and lifecycle management are planned."],
  ["analytics", "Analytics", "Analytics charts are placeholders until the dedicated event pipeline is available."],
  ["feedback", "Feedback", "Feedback collection and triage will be added later."],
  ["announcements", "Announcements", "Announcement publishing is intentionally deferred."],
  ["settings", "Settings", "Centralized platform settings and feature flags are intentionally deferred."],
  ["system", "System Health", "Review current admin API and database health."],
  ["logs", "Audit Logs", "Review persisted administrator actions."],
];

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/admin" replace />} />
      <Route path="/admin/login" element={<LoginPage />} />
      <Route path="/admin/forbidden" element={<ForbiddenPage />} />
      <Route element={<ProtectedAdminRoute />}>
        <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
        <Route element={<AdminLayout />}>
          <Route path="/admin/dashboard" element={<DashboardPage />} />
          <Route path="/admin/users" element={<UsersPage />} />
          <Route path="/admin/meetings" element={<MeetingsPage />} />
          {placeholders.map(([slug, title, description]) => (
            <Route key={slug} path={`/admin/${slug}`} element={<PlaceholderPage module={slug} title={title} description={description} />} />
          ))}
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/admin" replace />} />
    </Routes>
  );
}
