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
  if (!rows || rows.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "200px", border: "1px dashed var(--line)", borderRadius: "7px", background: "var(--surface-muted)", color: "var(--muted)", margin: "1rem 0" }}>
        <span style={{ fontSize: "13px" }}>No activity data available</span>
      </div>
    );
  }

  const maxMeetings = Math.max(...rows.map(r => r.meetings || 0), 1);
  const maxTranslations = Math.max(...rows.map(r => r.translations || 0), 1);
  const maxVal = Math.max(maxMeetings, maxTranslations, 1);

  // Divide Y-axis into 4 ticks
  const yTicks = [Math.round(maxVal), Math.round(maxVal * 0.66), Math.round(maxVal * 0.33), 0];

  return (
    <div className="admin-chart-wrapper" style={{ display: "flex", flexDirection: "column", gap: "10px", width: "100%", marginTop: "15px", padding: "10px" }}>
      {/* Legend */}
      <div className="admin-chart-legend" style={{ display: "flex", gap: "16px", fontSize: "11px", justifyContent: "flex-end", color: "var(--muted)" }}>
        <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{ width: "10px", height: "10px", background: "#3b82f6", borderRadius: "2px", display: "inline-block" }} /> Meetings
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{ width: "10px", height: "10px", background: "#8b5cf6", borderRadius: "2px", display: "inline-block" }} /> Translations
        </span>
      </div>

      <div style={{ display: "flex", height: "220px", width: "100%", position: "relative" }}>
        {/* Y Axis */}
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", fontSize: "9px", color: "var(--muted)", paddingRight: "8px", userSelect: "none", height: "180px", textAlign: "right", width: "30px" }}>
          {yTicks.map((tick, idx) => (
            <span key={idx}>{tick}</span>
          ))}
        </div>

        {/* Chart Area wrapper */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", height: "100%" }}>
          {/* Bars area */}
          <div style={{ flex: 1, display: "flex", alignItems: "end", justifyContent: "space-between", height: "180px", borderLeft: "1px solid var(--line)", borderBottom: "1px solid var(--line)", pb: "4px", paddingLeft: "10px", paddingRight: "10px", position: "relative" }}>
            {rows.map((row) => {
              const mHeight = ((row.meetings || 0) / maxVal) * 100;
              const tHeight = ((row.translations || 0) / maxVal) * 100;
              
              return (
                <div 
                  key={row.date} 
                  className="group"
                  style={{ position: "relative", display: "flex", flexDirection: "column", justifyContent: "end", alignItems: "center", gap: "3px", flex: 1, maxWidth: "28px", margin: "0 2px", height: "100%", cursor: "pointer" }}
                >
                  {/* Tooltip */}
                  <div 
                    className="tooltip-container"
                    style={{ position: "absolute", bottom: "100%", marginBottom: "6px", background: "#1c2521", border: "1px solid var(--line)", color: "#fff", padding: "6px 8px", borderRadius: "6px", fontSize: "10px", pointerEvents: "none", zIndex: 10, width: "120px", boxShadow: "var(--shadow)", textAlign: "left" }}
                  >
                    <div style={{ fontWeight: "bold", borderBottom: "1px solid rgba(255,255,255,0.08)", paddingBottom: "2px", marginBottom: "4px" }}>{row.date}</div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "#3b82f6" }}>Meetings:</span>
                      <span>{row.meetings || 0}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "#8b5cf6" }}>Translations:</span>
                      <span>{row.translations || 0}</span>
                    </div>
                  </div>

                  {/* Stacked Bars */}
                  <div style={{ width: "100%", display: "flex", flexDirection: "column", justifyContent: "end", height: "100%" }}>
                    <div 
                      style={{ height: `${tHeight}%`, background: "#8b5cf6", opacity: 0.85, borderTopLeftRadius: "2px", borderTopRightRadius: "2px", width: "100%", transition: "all 0.2s" }} 
                    />
                    <div 
                      style={{ height: `${mHeight}%`, background: "#3b82f6", opacity: 0.85, borderBottomLeftRadius: "2px", borderBottomRightRadius: "2px", width: "100%", transition: "all 0.2s" }} 
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* X Axis */}
          <div style={{ display: "flex", fontSize: "9px", color: "var(--muted)", justifyContent: "space-between", userSelect: "none", paddingTop: "6px", paddingLeft: "10px", paddingRight: "10px" }}>
            {rows.map((row, idx) => {
              const shouldShow = idx === 0 || idx === Math.floor(rows.length / 2) || idx === rows.length - 1;
              return (
                <span key={row.date} style={{ opacity: shouldShow ? 1 : 0 }}>
                  {row.date}
                </span>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
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
