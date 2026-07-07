import { Navigate, Route, Routes } from "react-router-dom";
import AdminLayout from "./components/AdminLayout";
import ProtectedAdminRoute from "./components/ProtectedAdminRoute";
import AnalyticsPage from "./pages/AnalyticsPage";
import AuditLogsPage from "./pages/AuditLogsPage";
import ContentPage from "./pages/ContentPage";
import DashboardPage from "./pages/DashboardPage";
import ForbiddenPage from "./pages/ForbiddenPage";
import LoginPage from "./pages/LoginPage";
import MediaPage from "./pages/MediaPage";
import MeetingsPage from "./pages/MeetingsPage";
import RegistryPage from "./pages/RegistryPage";
import RolesPage from "./pages/RolesPage";
import SettingsPage from "./pages/SettingsPage";
import SignupPage from "./pages/SignupPage";
import SystemHealthPage from "./pages/SystemHealthPage";
import UsersPage from "./pages/UsersPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/admin" replace />} />
      <Route path="/admin/login" element={<LoginPage />} />
      <Route path="/admin/signup" element={<SignupPage />} />
      <Route path="/admin/forbidden" element={<ForbiddenPage />} />
      <Route element={<ProtectedAdminRoute />}>
        <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
        <Route element={<AdminLayout />}>
          <Route path="/admin/dashboard" element={<DashboardPage />} />
          <Route path="/admin/users" element={<UsersPage />} />
          <Route path="/admin/meetings" element={<MeetingsPage />} />
          <Route path="/admin/analytics" element={<AnalyticsPage />} />
          <Route path="/admin/content" element={<ContentPage />} />
          <Route path="/admin/media" element={<MediaPage />} />
          <Route path="/admin/feature-flags" element={<RegistryPage module="feature-flags" eyebrow="Delivery" title="Feature Flags" description="Control staged administration features independently from deployment." />} />
          <Route path="/admin/languages" element={<RegistryPage module="languages" eyebrow="Localization" title="Languages" description="Manage language availability across STT, translation, and synthesized speech." canCreate={false} canDelete={false} />} />
          <Route path="/admin/voices" element={<RegistryPage module="voices" eyebrow="Speech" title="Voice Models" description="Register and manage voice-model metadata and availability." />} />
          <Route path="/admin/translation" element={<SettingsPage module="translation-settings" eyebrow="Translation" title="Translation Settings" description="Configure speech segmentation, language detection, translation timeouts, and synthesized speech defaults." />} />
          <Route path="/admin/feedback" element={<RegistryPage module="feedback" eyebrow="Customers" title="Feedback" description="Review and triage feedback submitted by platform users." canCreate={false} canDelete={false} />} />
          <Route path="/admin/announcements" element={<RegistryPage module="announcements" eyebrow="Communication" title="Announcements" description="Prepare and manage platform notices for users." />} />
          <Route path="/admin/roles" element={<RolesPage />} />
          <Route path="/admin/logs" element={<AuditLogsPage />} />
          <Route path="/admin/system" element={<SystemHealthPage />} />
          <Route path="/admin/settings" element={<SettingsPage title="Platform Settings" description="Manage organization-wide product defaults and retention controls." />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/admin" replace />} />
    </Routes>
  );
}
