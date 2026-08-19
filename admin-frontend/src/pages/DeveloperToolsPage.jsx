import { AlertTriangle, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import AdminPageHeader from "../components/AdminPageHeader";
import StatusBadge from "../components/StatusBadge";
import { deleteAdmin, fetchAdmin, patchAdmin, postAdmin } from "../services/api";

const EMPTY_FORM = { url: "", secret: "", events: "" };

export default function DeveloperToolsPage() {
  const [webhooks, setWebhooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [revealedSecret, setRevealedSecret] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [creating, setCreating] = useState(false);

  const load = () => {
    setLoading(true);
    fetchAdmin("/developer/webhooks")
      .then((data) => { setWebhooks(data.items || []); setMessage(""); })
      .catch((error) => setMessage(error.response?.data?.detail || "Could not load webhook subscribers"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const createWebhook = async (event) => {
    event.preventDefault();
    setCreating(true);
    setMessage("");
    try {
      const events = form.events.split(",").map((e) => e.trim()).filter(Boolean);
      const { webhook } = await postAdmin("/developer/webhooks", { url: form.url, secret: form.secret, events });
      setRevealedSecret(webhook);
      setForm(EMPTY_FORM);
      load();
    } catch (error) {
      setMessage(error.response?.data?.detail || "Could not create webhook subscriber");
    } finally {
      setCreating(false);
    }
  };

  const toggleEnabled = async (webhook) => {
    try {
      await patchAdmin(`/developer/webhooks/${webhook._id}`, { enabled: !webhook.enabled });
      load();
    } catch (error) {
      setMessage(error.response?.data?.detail || "Could not update webhook subscriber");
    }
  };

  const removeWebhook = async (webhook) => {
    if (!window.confirm(`Remove the webhook subscriber for ${webhook.url}?`)) return;
    try {
      await deleteAdmin(`/developer/webhooks/${webhook._id}`);
      load();
    } catch (error) {
      setMessage(error.response?.data?.detail || "Could not remove webhook subscriber");
    }
  };

  return (
    <>
      <AdminPageHeader
        eyebrow="Developer Tools"
        title="Webhooks &amp; Integrations"
        description="Manage outbound webhook subscribers for meeting.started/meeting.ended events. See the note below on the command-queue view this module deliberately does not include."
      >
        <button className="admin-button admin-button--secondary" onClick={load}><RefreshCw size={15} />Refresh</button>
      </AdminPageHeader>

      {message && <div className="admin-alert">{message}</div>}

      {revealedSecret && (
        <div className="admin-alert" style={{ borderColor: "var(--warning, #d97706)" }}>
          <strong>Signing secret (shown once, will not be shown again):</strong>{" "}
          <code style={{ userSelect: "all" }}>{revealedSecret.secret}</code>{" "}
          <button className="admin-button admin-button--secondary" onClick={() => setRevealedSecret(null)} style={{ marginLeft: 8 }}>
            Dismiss
          </button>
        </div>
      )}

      <section className="admin-settings-panel" style={{ marginBottom: 20 }}>
        <header><span>New subscriber</span><h2>Register a webhook</h2></header>
        <form onSubmit={createWebhook} className="admin-form-grid">
          <label>
            <span className="cms-field-label">Endpoint URL</span>
            <input
              required
              type="url"
              placeholder="https://example.com/hooks/voxo"
              value={form.url}
              onChange={(e) => setForm((prev) => ({ ...prev, url: e.target.value }))}
            />
          </label>
          <label>
            <span className="cms-field-label">Signing secret (min 16 characters)</span>
            <input
              required
              minLength={16}
              placeholder="Used to HMAC-sign the payload"
              value={form.secret}
              onChange={(e) => setForm((prev) => ({ ...prev, secret: e.target.value }))}
            />
          </label>
          <label style={{ gridColumn: "span 2" }}>
            <span className="cms-field-label">Events (comma-separated -- e.g. meeting.started, meeting.ended)</span>
            <input
              required
              placeholder="meeting.started, meeting.ended"
              value={form.events}
              onChange={(e) => setForm((prev) => ({ ...prev, events: e.target.value }))}
            />
          </label>
          <div style={{ gridColumn: "span 2" }}>
            <button type="submit" className="admin-button admin-button--primary" disabled={creating}>
              <Plus size={15} />{creating ? "Adding..." : "Add webhook"}
            </button>
          </div>
        </form>
      </section>

      <section className="admin-table-panel" style={{ marginBottom: 20 }}>
        <header style={{ padding: "16px 20px 0" }}><span>{webhooks.length} configured</span><h2>Webhook subscribers</h2></header>
        {loading ? <div className="admin-skeleton" /> : (
          <div className="admin-table-scroll"><table>
            <thead><tr><th>URL</th><th>Events</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {webhooks.map((hook) => (
                <tr key={hook._id}>
                  <td><strong>{hook.url}</strong></td>
                  <td className="admin-table-description">{hook.events.join(", ")}</td>
                  <td><StatusBadge value={hook.enabled ? "enabled" : "disabled"} /></td>
                  <td style={{ display: "flex", gap: 6 }}>
                    <button className="admin-button admin-button--secondary" onClick={() => toggleEnabled(hook)}>
                      {hook.enabled ? "Disable" : "Enable"}
                    </button>
                    <button className="admin-button admin-button--secondary" onClick={() => removeWebhook(hook)}>
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
              {webhooks.length === 0 && (
                <tr><td colSpan={4} className="admin-empty-copy">No webhook subscribers configured yet.</td></tr>
              )}
            </tbody>
          </table></div>
        )}
      </section>

      <section className="admin-settings-panel">
        <header><span>Known limitation</span><h2>Command-queue inspection</h2></header>
        <p className="admin-empty-copy" style={{ padding: 0, display: "flex", gap: 8, alignItems: "flex-start" }}>
          <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
          The admin-command control plane is Redis pub/sub only (publish, then synchronously wait for an ack) --
          nothing persists commands to a queryable queue, so the "queue_length" figure on the System Health page is
          always 0. A real command-queue inspection view was intentionally not built here, since there is no
          underlying queue to inspect; see PROJECT_HANDOFF.md for the full finding.
        </p>
      </section>
    </>
  );
}
