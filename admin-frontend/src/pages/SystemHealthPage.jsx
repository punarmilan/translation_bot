import { Activity, Cpu, Database, HardDrive, MemoryStick, Network, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import AdminPageHeader from "../components/AdminPageHeader";
import StatusBadge from "../components/StatusBadge";
import { getModule } from "../services/api";

export default function SystemHealthPage() {
  const [data, setData] = useState({ services: [], resources: {} });
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const load = () => {
    setLoading(true);
    getModule("system")
      .then((payload) => { setData(payload); setMessage(""); })
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
  return <><AdminPageHeader eyebrow="Operations" title="System Health" description="Live dependency probes and host resource utilization for the administration and meeting platform."><button className="admin-button admin-button--secondary" onClick={load}><RefreshCw size={15} />Refresh</button></AdminPageHeader>
    {message && <div className="admin-alert">{message}</div>}
    <section className="admin-metric-grid admin-metric-grid--four">{resources.map(([Icon, label, value]) => <article key={label}><div><span><Icon size={19} /></span><small>{label}</small></div><strong>{value}</strong><p>Current host reading</p></article>)}</section>
    {loading ? <div className="admin-skeleton" /> : <section className="admin-table-panel"><div className="admin-table-scroll"><table><thead><tr><th>Service</th><th>Status</th><th>Latency</th><th>Detail</th></tr></thead><tbody>{data.services.map((service) => <tr key={service.name}><td><strong>{service.name}</strong></td><td><StatusBadge value={service.status} /></td><td>{service.latency_ms == null ? "-" : `${service.latency_ms} ms`}</td><td>{service.detail || "Connected"}</td></tr>)}</tbody></table></div></section>}
  </>;
}
