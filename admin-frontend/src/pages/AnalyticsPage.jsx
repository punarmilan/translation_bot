import { BarChart3, Languages, MessageSquareText, Users, Video } from "lucide-react";
import { useEffect, useState } from "react";
import AdminPageHeader from "../components/AdminPageHeader";
import { getModule } from "../services/api";

function Distribution({ title, items = [] }) {
  const max = Math.max(...items.map((item) => item.value), 1);
  return <article className="admin-panel"><header><div><span>Distribution</span><h2>{title}</h2></div><BarChart3 size={18} /></header><div className="admin-distribution">{items.map((item) => <div key={item.label}><span>{item.label}</span><i><b style={{ width: `${(item.value / max) * 100}%` }} /></i><strong>{item.value}</strong></div>)}</div></article>;
}

export default function AnalyticsPage() {
  const [data, setData] = useState({ totals: {} });
  useEffect(() => { getModule("analytics").then(setData); }, []);
  const metrics = [[Users, "Users", data.totals.users], [Video, "Rooms", data.totals.rooms], [MessageSquareText, "Messages", data.totals.messages], [Languages, "Translation events", data.totals.translation_events]];
  return <><AdminPageHeader eyebrow="Insights" title="Analytics" description="Persisted platform usage and adoption signals. Event-level product analytics can be added without changing this reporting contract." />
    <section className="admin-metric-grid admin-metric-grid--four">{metrics.map(([Icon, label, value]) => <article key={label}><div><span><Icon size={19} /></span><small>{label}</small></div><strong>{value ?? "-"}</strong><p>Persisted total</p></article>)}</section>
    <section className="admin-dashboard-grid"><Distribution title="Users by language" items={data.users_by_language} /><Distribution title="Users by role" items={data.users_by_role} /></section>
  </>;
}
