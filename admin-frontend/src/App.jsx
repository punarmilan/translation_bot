import { Component } from "react";
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
import LanguagesPage from "./pages/LanguagesPage";
import VoicesPage from "./pages/VoicesPage";
import BrandPage from "./pages/BrandPage";
import PageBuilderPage from "./pages/PageBuilderPage";
import MediaLibraryPage from "./pages/MediaLibraryPage";
import FeedbackPage from "./pages/FeedbackPage";

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 text-slate-100">
          <div className="max-w-md p-6 rounded-2xl bg-slate-900 border border-red-500/30 text-center space-y-3">
            <h1 className="text-lg font-bold text-red-400">VOXO Admin Application Error</h1>
            <p className="text-xs text-slate-400">{this.state.error.message || "An unexpected error occurred in the Admin Console."}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white font-bold text-xs"
            >
              Reload Console
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function AdminAppRoutes() {
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
          <Route path="/admin/branding" element={<BrandPage />} />
          <Route path="/admin/page-builder" element={<PageBuilderPage />} />
          <Route path="/admin/media-library" element={<MediaLibraryPage />} />
          <Route path="/admin/users" element={<UsersPage />} />
          <Route path="/admin/meetings" element={<MeetingsPage />} />
          <Route path="/admin/analytics" element={<AnalyticsPage />} />
          <Route path="/admin/content" element={<ContentPage />} />
          <Route path="/admin/media" element={<MediaPage />} />
          <Route path="/admin/feature-flags" element={<RegistryPage module="feature-flags" eyebrow="Delivery" title="Feature Flags" description="Control staged administration features independently from deployment." />} />
          <Route path="/admin/feature-flag" element={<Navigate to="/admin/feature-flags" replace />} />
          <Route path="/admin/languages" element={<LanguagesPage />} />
          <Route path="/admin/voices" element={<VoicesPage />} />
          <Route path="/admin/translation" element={<SettingsPage module="translation-settings" eyebrow="Translation" title="Translation Settings" description="Configure speech segmentation, language detection, translation timeouts, and synthesized speech defaults." />} />
          <Route path="/admin/feedback" element={<FeedbackPage />} />
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

export default function App() {
  return (
    <ErrorBoundary>
      <AdminAppRoutes />
    </ErrorBoundary>
  );
}
