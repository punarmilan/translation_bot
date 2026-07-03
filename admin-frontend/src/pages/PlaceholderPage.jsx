import { Activity, Boxes, CircleDot, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import AdminPageHeader from "../components/AdminPageHeader";
import StatusBadge from "../components/StatusBadge";
import { getModule } from "../services/api";

export default function PlaceholderPage({ module, title, description }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  const load = () => {
    setError("");
    getModule(module).then(setData).catch((requestError) => setError(requestError.response?.data?.detail || `Could not load ${title}`));
  };

  useEffect(load, [module]);

  return (
    <>
      <AdminPageHeader eyebrow="Platform module" title={title} description={description}>
        <button className="admin-button admin-button--secondary" onClick={load}><RefreshCw size={15} />Refresh</button>
      </AdminPageHeader>
      {error && <div className="admin-alert admin-alert--error">{error}</div>}
      <section className="admin-placeholder">
        <div className="admin-placeholder__icon">{module === "system" ? <Activity /> : <Boxes />}</div>
        <StatusBadge value={data?.status || "loading"} />
        <h2>{data?.status === "operational" ? "Systems are operational" : `${title} is prepared for a future release`}</h2>
        <p>{data?.note || description}</p>
        {data?.services && <div className="admin-service-list">{Object.entries(data.services).map(([name, status]) => <div key={name}><span><CircleDot size={15} />{name.replaceAll("_", " ")}</span><StatusBadge value={status} /></div>)}</div>}
        {data?.items?.length > 0 && <div className="admin-simple-grid">{data.items.map((item) => <article key={item.code || item.log_id || item.name}><strong>{item.name || item.action || "Item"}</strong><small>{item.code || item.timestamp || item.status}</small></article>)}</div>}
      </section>
    </>
  );
}
