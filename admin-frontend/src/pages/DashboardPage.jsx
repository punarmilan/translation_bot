import {
  Activity, Clock3, Globe2, Languages, MessageSquareText, Radio, RefreshCw,
  Timer, UserPlus, Users, Video, Volume2,
} from "lucide-react";
import { useEffect, useState } from "react";
import AdminPageHeader from "../components/AdminPageHeader";
import StatusBadge from "../components/StatusBadge";
import { getDashboard } from "../services/api";

const metricConfig = [
  ["total_users", "Total Users", Users],
  ["online_users", "Online Users", Radio],
  ["meetings_today", "Meetings Today", Video],
  ["active_meetings", "Active Meetings", Activity],
  ["messages_translated", "Messages Translated", MessageSquareText],
  ["voice_minutes", "Voice Minutes", Volume2],
  ["translation_requests", "Translation Requests", RefreshCw],
  ["average_latency_ms", "Average Latency", Timer],
  ["countries_connected", "Countries Connected", Globe2],
  ["supported_languages", "Supported Languages", Languages],
];

function MiniChart({ rows = [] }) {
  const values = rows.map((row) => row.meetings + row.translations + row.users);
  const max = Math.max(...values, 1);
  return <div className="admin-mini-chart" aria-label="Persisted usage chart">{rows.map((row) => <i key={row.date} title={`${row.date}: ${row.meetings} meetings, ${row.translations} translations`} style={{ height: `${Math.max(8, ((row.meetings + row.translations + row.users) / max) * 100)}%` }} />)}</div>;
}

export default function DashboardPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => { getDashboard().then(setData).catch((requestError) => setError(requestError.response?.data?.detail || "Dashboard data unavailable")); }, []);

  return (
    <>
      <AdminPageHeader eyebrow="Overview" title="Dashboard" description="Operational signals across users, meetings, translation activity, and system events."><button className="admin-button admin-button--secondary" onClick={() => getDashboard().then(setData)}><RefreshCw size={15} />Refresh</button></AdminPageHeader>
      {error && <div className="admin-alert admin-alert--error">{error}</div>}
      <section className="admin-metric-grid">
        {metricConfig.map(([key, label, Icon]) => {
          const value = data?.metrics?.[key];
          return <article key={key}><div><span><Icon size={19} /></span><small>{label}</small></div><strong>{value ?? "-"}</strong><p>{value == null ? data?.metric_notes?.[key] || "Awaiting persisted data" : "Live persisted value"}</p></article>;
        })}
      </section>
      <section className="admin-dashboard-grid">
        <article className="admin-panel admin-panel--chart"><header><div><span>Meeting activity</span><h2>Usage overview</h2></div><small>Last 14 days</small></header><MiniChart rows={data?.charts?.daily_usage || []} /><footer><span><i />Meetings</span><span><i />Translations</span></footer></article>
        <article className="admin-panel"><header><div><span>Users</span><h2>Recent signups</h2></div><UserPlus size={18} /></header><div className="admin-activity-list">{(data?.recent_signups || []).map((user) => <div key={user._id}><span className="admin-avatar">{(user.name || user.username || "U")[0]}</span><div><strong>{user.name || user.username}</strong><small>{user.email}</small></div><StatusBadge value={user.role} /></div>)}{!data && <div className="admin-skeleton" />}</div></article>
        <article className="admin-panel"><header><div><span>Meetings</span><h2>Recent meetings</h2></div><Clock3 size={18} /></header><div className="admin-activity-list">{(data?.recent_meetings || []).map((meeting) => <div key={meeting._id}><span className="admin-avatar"><Video size={15} /></span><div><strong>{meeting.room_name || meeting.room_id}</strong><small>{meeting.created_at || "No timestamp"}</small></div><StatusBadge value={meeting.is_active ? "active" : "ended"} /></div>)}</div></article>
        <article className="admin-panel"><header><div><span>Reliability</span><h2>Recent errors</h2></div><Activity size={18} /></header><div className="admin-activity-list">{(data?.recent_errors || []).map((item, index) => <div key={item._id || index}><span className="admin-avatar admin-avatar--error">!</span><div><strong>Translation failure</strong><small>{item.room_id || "Unknown room"}</small></div><StatusBadge value="error" /></div>)}{data && data.recent_errors?.length === 0 && <p className="admin-empty-copy">No persisted translation errors.</p>}</div></article>
      </section>
    </>
  );
}
