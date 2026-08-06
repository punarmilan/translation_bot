import { Plus, Users, X } from "lucide-react";
import { useEffect, useState } from "react";
import AdminPageHeader from "../components/AdminPageHeader";
import EmptyState from "../components/EmptyState";
import StatusBadge from "../components/StatusBadge";
import { fetchAdmin, postAdmin } from "../services/api";

const emptyOrg = { name: "", domain: "", enabled: true };

export default function OrganizationsPage() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(emptyOrg);
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [viewing, setViewing] = useState(null);
  const [orgUsers, setOrgUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);

  const load = () => {
    setLoading(true);
    fetchAdmin("/enterprise/organizations")
      .then((data) => { setItems(data.items || []); setMessage(""); })
      .catch((error) => setMessage(error.response?.data?.detail || "Could not load organizations"))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!form.name.trim() || !form.domain.trim()) {
      setMessage("Name and domain are required");
      return;
    }
    try {
      await postAdmin("/enterprise/organizations", form);
      setForm(emptyOrg);
      setShowForm(false);
      setMessage("Organization created");
      load();
    } catch (error) {
      setMessage(error.response?.data?.detail || "Create failed");
    }
  };

  const viewUsers = async (org) => {
    setViewing(org);
    setUsersLoading(true);
    try {
      const data = await fetchAdmin(`/enterprise/organizations/${org._id}/users`);
      setOrgUsers(data.users || []);
    } catch (error) {
      setMessage(error.response?.data?.detail || "Could not load organization users");
    } finally {
      setUsersLoading(false);
    }
  };

  return (
    <>
      <AdminPageHeader
        eyebrow="Enterprise"
        title="Organizations"
        description="Group users under a company domain with their own branding overrides -- the multi-tenant boundary above individual users."
      >
        <button className="admin-button admin-button--primary" onClick={() => setShowForm((v) => !v)}>
          <Plus size={15} />New organization
        </button>
      </AdminPageHeader>

      {message && <div className="admin-alert">{message}<button onClick={() => setMessage("")}><X size={14} /></button></div>}

      {showForm && (
        <section className="admin-settings-panel" style={{ marginBottom: 16 }}>
          <header><span>New organization</span><h2>Create organization</h2></header>
          <div className="admin-form-grid">
            <label><span>Name</span><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
            <label><span>Domain</span><input value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })} placeholder="acme.com" /></label>
          </div>
          <button className="admin-button admin-button--primary" style={{ marginTop: 12 }} onClick={save}>Create</button>
        </section>
      )}

      {loading ? <div className="admin-skeleton" /> : items.length === 0 ? <EmptyState /> : (
        <section className="admin-table-panel"><div className="admin-table-scroll"><table>
          <thead><tr><th>Name</th><th>Domain</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead>
          <tbody>
            {items.map((org) => (
              <tr key={org._id}>
                <td><strong>{org.name}</strong></td>
                <td>{org.domain}</td>
                <td><StatusBadge value={org.enabled === false ? "disabled" : "active"} /></td>
                <td>{org.created_at ? new Date(org.created_at).toLocaleDateString() : "-"}</td>
                <td><div className="admin-row-actions"><button title="View users" onClick={() => viewUsers(org)}><Users size={15} /></button></div></td>
              </tr>
            ))}
          </tbody>
        </table></div></section>
      )}

      {viewing && (
        <div className="admin-modal-backdrop" onMouseDown={() => setViewing(null)}>
          <section className="admin-modal admin-modal--wide" onMouseDown={(e) => e.stopPropagation()}>
            <header><div><span>Organization</span><h2>{viewing.name} — users</h2></div><button onClick={() => setViewing(null)}><X /></button></header>
            {usersLoading ? <div className="admin-skeleton" /> : orgUsers.length === 0 ? (
              <p className="admin-empty-copy">No users belong to this organization yet.</p>
            ) : (
              <div className="admin-table-scroll"><table>
                <thead><tr><th>Name</th><th>Email</th><th>Role</th></tr></thead>
                <tbody>{orgUsers.map((u) => <tr key={u._id}><td>{u.name || u.username || "-"}</td><td>{u.email}</td><td>{u.role}</td></tr>)}</tbody>
              </table></div>
            )}
          </section>
        </div>
      )}
    </>
  );
}
