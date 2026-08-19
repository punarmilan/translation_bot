import { LogOut, RefreshCw, ShieldAlert } from "lucide-react";
import { useEffect, useState } from "react";
import AdminPageHeader from "../components/AdminPageHeader";
import { deleteAdmin, fetchAdmin } from "../services/api";

function formatDate(value) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

export default function SecurityPage() {
  const [policy, setPolicy] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [revokingId, setRevokingId] = useState(null);

  const load = () => {
    setLoading(true);
    Promise.all([fetchAdmin("/security/policy"), fetchAdmin("/security/sessions")])
      .then(([policyData, sessionsData]) => {
        setPolicy(policyData);
        setSessions(sessionsData.items || []);
        setMessage("");
      })
      .catch((error) => setMessage(error.response?.data?.detail || "Could not load security data"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const revoke = async (sessionId) => {
    setRevokingId(sessionId);
    try {
      await deleteAdmin(`/security/sessions/${sessionId}`);
      setSessions((prev) => prev.filter((item) => item.session_id !== sessionId));
    } catch (error) {
      setMessage(error.response?.data?.detail || "Could not revoke this session");
    } finally {
      setRevokingId(null);
    }
  };

  return (
    <>
      <AdminPageHeader
        eyebrow="Security"
        title="Session &amp; Access Security"
        description="Read-only view of the current admin session, cookie, and rate-limit policy, plus every active admin session with a revoke action. Session lifetime and rate-limit thresholds are not yet editable from here -- see PROJECT_HANDOFF.md for the intentional read-only-first scoping."
      >
        <button className="admin-button admin-button--secondary" onClick={load}><RefreshCw size={15} />Refresh</button>
      </AdminPageHeader>

      {message && <div className="admin-alert">{message}</div>}

      {loading || !policy ? <div className="admin-skeleton" /> : (
        <>
          <section className="admin-settings-panel" style={{ marginBottom: 20 }}>
            <header><span>Current values</span><h2>Session &amp; cookie policy</h2></header>
            <div className="admin-form-grid">
              <div><span className="cms-field-label">Access token lifetime</span><p>{policy.session.access_token_expire_minutes} minutes</p></div>
              <div><span className="cms-field-label">Refresh token lifetime</span><p>{policy.session.refresh_token_expire_days} days</p></div>
              <div><span className="cms-field-label">Cookie SameSite</span><p>{policy.cookies.samesite}</p></div>
              <div><span className="cms-field-label">Cookie Secure flag</span><p>{policy.cookies.secure ? "Enabled" : "Disabled (local/HTTP dev)"}</p></div>
              <div><span className="cms-field-label">Default invitation expiry</span><p>{policy.invitations.default_expire_hours} hours</p></div>
              <div>
                <span className="cms-field-label">Login rate limit</span>
                <p>{policy.login_rate_limit.max_failed_attempts} failed attempts / {policy.login_rate_limit.window_minutes} minutes</p>
              </div>
            </div>
            {!policy.login_rate_limit.distributed && (
              <p className="admin-empty-copy" style={{ padding: "12px 0 0", display: "flex", gap: 8, alignItems: "flex-start" }}>
                <ShieldAlert size={16} style={{ flexShrink: 0, marginTop: 2 }} />
                This rate limiter runs in-process on a single backend instance -- it resets on restart and does not coordinate
                across replicas. Fine for the current single-instance deployment; revisit if this service is ever scaled horizontally.
              </p>
            )}
          </section>

          <section className="admin-table-panel">
            <header style={{ padding: "16px 20px 0" }}><span>{sessions.length} active</span><h2>Admin sessions</h2></header>
            <div className="admin-table-scroll"><table>
              <thead><tr><th>Admin</th><th>Created</th><th>Expires</th><th>IP address</th><th>User agent</th><th></th></tr></thead>
              <tbody>
                {sessions.map((session) => (
                  <tr key={session.session_id}>
                    <td><strong>{session.admin_name}</strong><br /><span className="admin-table-description">{session.admin_email}</span></td>
                    <td>{formatDate(session.created_at)}</td>
                    <td>{formatDate(session.expires_at)}</td>
                    <td>{session.ip_address || "—"}</td>
                    <td className="admin-table-description">{session.user_agent || "—"}</td>
                    <td>
                      <button
                        className="admin-button admin-button--secondary"
                        disabled={revokingId === session.session_id}
                        onClick={() => revoke(session.session_id)}
                      >
                        <LogOut size={14} />{revokingId === session.session_id ? "Revoking..." : "Revoke"}
                      </button>
                    </td>
                  </tr>
                ))}
                {sessions.length === 0 && (
                  <tr><td colSpan={6} className="admin-empty-copy">No active admin sessions.</td></tr>
                )}
              </tbody>
            </table></div>
          </section>
        </>
      )}
    </>
  );
}
