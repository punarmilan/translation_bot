import { FileClock, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import AdminPageHeader from "../components/AdminPageHeader";
import EmptyState from "../components/EmptyState";
import { getModule } from "../services/api";

export default function AuditLogsPage() {
  const [items, setItems] = useState([]);
  const load = () => getModule("logs", { limit: 250 }).then((data) => setItems(data.items || []));
  useEffect(load, []);
  return <><AdminPageHeader eyebrow="Governance" title="Audit Logs" description="Immutable records of administrator authentication, content publishing, configuration, moderation, and account actions."><button className="admin-button admin-button--secondary" onClick={load}><RefreshCw size={15} />Refresh</button></AdminPageHeader>
    {items.length === 0 ? <EmptyState title="No audit events" /> : <section className="admin-timeline">{items.map((item) => <article key={item._id || item.log_id}><span><FileClock size={15} /></span><div><strong>{item.action}</strong><p>{item.target_type}: {item.target_id}</p><small>{item.timestamp ? new Date(item.timestamp).toLocaleString() : ""} · actor {item.actor_id}</small></div></article>)}</section>}
  </>;
}
