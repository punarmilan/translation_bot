import { Download, FileClock, RefreshCw, Search } from "lucide-react";
import { useEffect, useState } from "react";
import AdminPageHeader from "../components/AdminPageHeader";
import EmptyState from "../components/EmptyState";
import { exportAuditLogs, getModule } from "../services/api";

export default function AuditLogsPage() {
  const [items, setItems] = useState([]);
  const [filters, setFilters] = useState({ search: "", action: "" });
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    return getModule("logs", { limit: 250, ...filters })
      .then((data) => {
        setItems(data.items || []);
        setMessage("");
      })
      .catch((error) => setMessage(error.response?.data?.detail || "Could not load audit logs"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const download = async () => {
    try {
      const blob = await exportAuditLogs(filters);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "admin-audit-logs.csv";
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setMessage(error.response?.data?.detail || "Audit export failed");
    }
  };

  return (
    <>
      <AdminPageHeader eyebrow="Governance" title="Audit Logs" description="Immutable records of administrator authentication, content publishing, configuration, moderation, and account actions.">
        <button className="admin-button admin-button--secondary" onClick={download}><Download size={15} />Export</button>
        <button className="admin-button admin-button--secondary" onClick={load}><RefreshCw size={15} />Refresh</button>
      </AdminPageHeader>
      {message && <div className="admin-alert">{message}</div>}
      <section className="admin-toolbar">
        <label><Search size={16} /><input value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} onKeyDown={(event) => event.key === "Enter" && load()} placeholder="Search action, actor, or target" /></label>
        <input value={filters.action} onChange={(event) => setFilters({ ...filters, action: event.target.value })} placeholder="Filter action" />
        <button className="admin-button admin-button--primary" onClick={load}>Search</button>
      </section>
      {loading ? <div className="admin-skeleton" /> : items.length === 0 ? <EmptyState title="No audit events" /> : (
        <section className="admin-timeline">
          {items.map((item) => (
            <article key={item._id || item.log_id}>
              <span><FileClock size={15} /></span>
              <div>
                <strong>{item.action}</strong>
                <p>{item.target_type}: {item.target_id}</p>
                <small>{item.timestamp ? new Date(item.timestamp).toLocaleString() : ""} - actor {item.actor_id}</small>
              </div>
            </article>
          ))}
        </section>
      )}
    </>
  );
}
