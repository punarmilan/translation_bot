import { CheckCircle2, RefreshCw, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import AdminPageHeader from "../components/AdminPageHeader";
import StatusBadge from "../components/StatusBadge";
import { fetchAdmin } from "../services/api";

function SecretChip({ configured }) {
  return configured ? (
    <span className="admin-row-actions" style={{ color: "var(--success, #2f9668)", display: "inline-flex", alignItems: "center", gap: 6 }}>
      <CheckCircle2 size={14} />Customized
    </span>
  ) : (
    <span className="admin-row-actions" style={{ color: "var(--danger)", display: "inline-flex", alignItems: "center", gap: 6 }}>
      <XCircle size={14} />Still using placeholder default
    </span>
  );
}

export default function InfrastructurePage() {
  const [data, setData] = useState(null);
  const [health, setHealth] = useState(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [healthLoading, setHealthLoading] = useState(true);

  const load = () => {
    setLoading(true);
    fetchAdmin("/infrastructure")
      .then((payload) => { setData(payload); setMessage(""); })
      .catch((error) => setMessage(error.response?.data?.detail || "Could not load infrastructure reference"))
      .finally(() => setLoading(false));
    setHealthLoading(true);
    fetchAdmin("/infrastructure/health")
      .then((payload) => setHealth(payload))
      .catch(() => setHealth(null))
      .finally(() => setHealthLoading(false));
  };
  useEffect(() => { load(); }, []);

  return (
    <>
      <AdminPageHeader
        eyebrow="Infrastructure"
        title="Deployment Reference"
        description="A read-only view of how this platform is deployed -- Docker services, Caddy routing, TURN/STUN, and which secrets are still using their placeholder defaults. Not a live control surface: nothing here restarts a container or edits the Caddyfile."
      >
        <button className="admin-button admin-button--secondary" onClick={load}><RefreshCw size={15} />Refresh</button>
      </AdminPageHeader>

      {message && <div className="admin-alert">{message}</div>}

      <section className="admin-settings-panel" style={{ marginBottom: 20 }}>
        <header><span>Live reachability checks</span><h2>Dependency health</h2></header>
        {healthLoading || !health ? <div className="admin-skeleton" /> : (
          <div className="admin-table-scroll"><table>
            <thead><tr><th>Dependency</th><th>Status</th><th>Detail</th></tr></thead>
            <tbody>
              {health.checked.map((svc) => (
                <tr key={svc.name}>
                  <td><strong>{svc.name}</strong></td>
                  <td><StatusBadge value={svc.status} /></td>
                  <td className="admin-table-description">{svc.latency_ms != null ? `${svc.latency_ms} ms · ` : ""}{svc.detail || "—"}</td>
                </tr>
              ))}
              {health.not_inspectable.map((svc) => (
                <tr key={svc.name}>
                  <td><strong>{svc.name}</strong></td>
                  <td><StatusBadge value="not inspectable" /></td>
                  <td className="admin-table-description">{svc.detail}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </section>

      {loading || !data ? <div className="admin-skeleton" /> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <section className="admin-table-panel">
            <div className="admin-table-scroll"><table>
              <thead><tr><th>Service</th><th>Role</th><th>Port</th><th>Image</th></tr></thead>
              <tbody>
                {data.services.map((svc) => (
                  <tr key={svc.name}>
                    <td><strong>{svc.name}</strong></td>
                    <td className="admin-table-description">{svc.role}</td>
                    <td>{svc.port ?? "—"}</td>
                    <td>{svc.image}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </section>

          <section className="admin-settings-panel">
            <header><span>Reverse proxy</span><h2>Caddy routes</h2></header>
            <div className="admin-table-scroll"><table>
              <thead><tr><th>Host</th><th>Proxies to</th><th>Notes</th></tr></thead>
              <tbody>
                {data.caddy_routes.map((route) => (
                  <tr key={route.host}>
                    <td><strong>{route.host}</strong></td>
                    <td>{route.proxies_to}</td>
                    <td className="admin-table-description">{route.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </section>

          <section className="admin-settings-panel">
            <header><span>WebRTC relay</span><h2>TURN / STUN</h2></header>
            <p className="admin-empty-copy" style={{ padding: 0, marginBottom: 12 }}>{data.turn_stun.note}</p>
            <div className="admin-form-grid">
              <div><span className="cms-field-label">Expected environment variables</span><p>{data.turn_stun.expected_env.join(", ")}</p></div>
              <div><span className="cms-field-label">STUN fallback</span><p>{data.turn_stun.default_stun_fallback}</p></div>
              <div style={{ gridColumn: "span 2" }}>
                <span className="cms-field-label">Required firewall ports</span>
                <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                  {data.turn_stun.required_firewall_ports.map((p) => <li key={p}>{p}</li>)}
                </ul>
              </div>
            </div>
          </section>

          <section className="admin-settings-panel">
            <header><span>This service's own config</span><h2>Environment</h2></header>
            <div className="admin-form-grid">
              <div><span className="cms-field-label">Public backend URL</span><p>{data.environment.public_backend_url}</p></div>
              <div><span className="cms-field-label">LibreTranslate URL</span><p>{data.environment.libretranslate_url}</p></div>
              <div><span className="cms-field-label">Media root</span><p>{data.environment.media_root}</p></div>
              <div><span className="cms-field-label">Max upload size</span><p>{data.environment.max_upload_mb} MB</p></div>
              <div style={{ gridColumn: "span 2" }}><span className="cms-field-label">Admin frontend origins</span><p>{data.environment.admin_frontend_origins.join(", ")}</p></div>
              <div style={{ gridColumn: "span 2" }}><span className="cms-field-label">Public content origins</span><p>{data.environment.public_content_origins.join(", ")}</p></div>
            </div>
          </section>

          <section className="admin-settings-panel">
            <header><span>Never displays the actual value</span><h2>Secrets status</h2></header>
            <div className="admin-table-scroll"><table>
              <thead><tr><th>Secret</th><th>Status</th></tr></thead>
              <tbody>
                {Object.entries(data.secrets_configured).map(([name, configured]) => (
                  <tr key={name}><td><strong>{name}</strong></td><td><SecretChip configured={configured} /></td></tr>
                ))}
              </tbody>
            </table></div>
          </section>
        </div>
      )}
    </>
  );
}
