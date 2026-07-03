import {
  Activity, BarChart3, Bell, BookOpenText, ChevronDown, CircleUserRound, Database,
  FileClock, Gauge, Languages, LayoutDashboard, Megaphone, Menu, MessageSquareText,
  MicVocal, Search, Settings, Users, Video, X,
} from "lucide-react";
import { useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAdminAuth } from "../state/AdminAuthContext";
import { useAdminTheme } from "../state/AdminThemeContext";

const navigation = [
  ["/admin/dashboard", LayoutDashboard, "Dashboard"],
  ["/admin/users", Users, "Users"],
  ["/admin/meetings", Video, "Meetings"],
  ["/admin/content", BookOpenText, "Content"],
  ["/admin/media", Database, "Media"],
  ["/admin/languages", Languages, "Languages"],
  ["/admin/voices", MicVocal, "Voice Models"],
  ["/admin/analytics", BarChart3, "Analytics"],
  ["/admin/feedback", MessageSquareText, "Feedback"],
  ["/admin/announcements", Megaphone, "Announcements"],
  ["/admin/settings", Settings, "Settings"],
  ["/admin/logs", FileClock, "Audit Logs"],
  ["/admin/system", Activity, "System Health"],
];

export default function AdminLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const { pathname } = useLocation();
  const { admin, logout } = useAdminAuth();
  const { theme, toggle } = useAdminTheme();
  const current = navigation.find(([path]) => pathname.startsWith(path));

  return (
    <div className="admin-app">
      <aside className={`admin-sidebar ${mobileOpen ? "is-open" : ""}`}>
        <div className="admin-brand"><span>TB</span><div><strong>Translation Bot</strong><small>Admin Console</small></div><button onClick={() => setMobileOpen(false)} aria-label="Close navigation"><X size={18} /></button></div>
        <nav aria-label="Admin navigation">
          {navigation.map(([path, Icon, label]) => (
            <NavLink key={path} to={path} onClick={() => setMobileOpen(false)} className={({ isActive }) => isActive ? "is-active" : ""}>
              <Icon size={18} strokeWidth={1.8} /><span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="admin-sidebar__footer"><Gauge size={17} /><span><strong>Admin API</strong><small>Connected</small></span><i /></div>
      </aside>
      {mobileOpen && <button className="admin-sidebar-backdrop" onClick={() => setMobileOpen(false)} aria-label="Close navigation overlay" />}

      <div className="admin-workspace">
        <header className="admin-topbar">
          <button className="admin-menu-button" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu size={20} /></button>
          <div className="admin-breadcrumb"><span>Admin</span><b>/</b><strong>{current?.[2] || "Dashboard"}</strong></div>
          <label className="admin-global-search"><Search size={16} /><input placeholder="Search admin console..." /></label>
          <button className="admin-icon-button" aria-label="Notifications"><Bell size={18} /><span /></button>
          <button className="admin-theme-toggle" onClick={toggle}>{theme === "light" ? "Dark" : "Light"}</button>
          <div className="admin-profile">
            <button onClick={() => setProfileOpen((value) => !value)} aria-expanded={profileOpen}>
              <span>{(admin?.name || "A").slice(0, 1).toUpperCase()}</span>
              <div><strong>{admin?.name}</strong><small>Administrator</small></div><ChevronDown size={15} />
            </button>
            {profileOpen && <div className="admin-profile__menu"><p>{admin?.email}</p><button onClick={logout}><CircleUserRound size={15} />Sign out</button></div>}
          </div>
        </header>
        <main className="admin-content"><Outlet /></main>
      </div>
    </div>
  );
}
