import { Activity, Cpu, Database, Gauge, HardDrive, MemoryStick, Network, RefreshCw, Video } from "lucide-react";
import { useEffect, useState } from "react";
import AdminPageHeader from "../components/AdminPageHeader";
import StatusBadge from "../components/StatusBadge";
import { getModule } from "../services/api";

export default function SystemHealthPage() {
  const [data, setData] = useState({ services: [], resources: {}, realtime: {}, latency: {} });
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const load = () => {
    setLoading(true);
    getModule("system")
      .then((payload) => { setData({ realtime: {}, latency: {}, ...payload }); setMessage(""); })
      .catch((error) => setMessage(error.response?.data?.detail || "Could not load system health"))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    load();
  }, []);
  const resources = [
    [Cpu, "CPU", `${data.resources.cpu_percent ?? "-"}%`],
    [MemoryStick, "RAM", `${data.resources.ram_percent ?? "-"}%`],
    [HardDrive, "Disk", `${data.resources.disk_percent ?? "-"}%`],
    [Network, "Network sent", data.resources.network_sent_bytes ? `${Math.round(data.resources.network_sent_bytes / 1048576)} MB` : "-"],
    [Activity, "Queue length", data.resources.queue_length ?? "-"],
    [Database, "Connected users", data.resources.connected_users ?? "-"],
    [RefreshCw, "Uptime", data.resources.uptime_seconds ? `${Math.round(data.resources.uptime_seconds / 60)}m` : "-"],
  ];
  const realtime = data.realtime || {};
  const latency = data.latency || {};
  const meetingMetrics = [
    [Video, "Active meetings", realtime.active_meetings ?? "-"],
    [Activity, "Active WebSocket connections", realtime.reachable ? (realtime.active_websocket_connections ?? "-") : "unreachable"],
    [Gauge, "Avg. round-trip latency", latency.average_round_trip_ms != null ? `${latency.average_round_trip_ms} ms` : "no data yet"],
  ];
  return <><AdminPageHeader eyebrow="Operations" title="System Health" description="Live dependency probes and host resource utilization for the administration and meeting platform."><button className="admin-button admin-button--secondary" onClick={load}><RefreshCw size={15} />Refresh</button></AdminPageHeader>
    {message && <div className="admin-alert">{message}</div>}
    <section className="admin-metric-grid admin-metric-grid--four">{resources.map(([Icon, label, value]) => <article key={label}><div><span><Icon size={19} /></span><small>{label}</small></div><strong>{value}</strong><p>Current host reading</p></article>)}</section>
    <h3 style={{ margin: "24px 0 10px", fontSize: 13, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" }}>Realtime meeting platform</h3>
    <section className="admin-metric-grid admin-metric-grid--four">{meetingMetrics.map(([Icon, label, value]) => <article key={label}><div><span><Icon size={19} /></span><small>{label}</small></div><strong>{value}</strong><p>{label === "Avg. round-trip latency" ? `${latency.sample_count ?? 0} samples logged` : "Read from the public backend"}</p></article>)}</section>
    {latency.stt_ms == null && (
      <p style={{ fontSize: 12, color: "var(--muted)", margin: "10px 2px 0" }}>
        Per-stage STT / translation / TTS latency isn't broken out yet -- only the combined round-trip figure is currently persisted. See Infrastructure → known gaps.
      </p>
    )}
    {loading ? <div className="admin-skeleton" /> : <section className="admin-table-panel" style={{ marginTop: 20 }}><div className="admin-table-scroll"><table><thead><tr><th>Service</th><th>Status</th><th>Latency</th><th>Detail</th></tr></thead><tbody>{data.services.map((service) => <tr key={service.name}><td><strong>{service.name}</strong></td><td><StatusBadge value={service.status} /></td><td>{service.latency_ms == null ? "-" : `${service.latency_ms} ms`}</td><td>{service.detail || "Connected"}</td></tr>)}</tbody></table></div></section>}
  </>;
}
