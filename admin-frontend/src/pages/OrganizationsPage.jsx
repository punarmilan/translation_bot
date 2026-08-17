import { Edit3, Plus, Users, X } from "lucide-react";
import { useEffect, useState } from "react";
import AdminPageHeader from "../components/AdminPageHeader";
import EmptyState from "../components/EmptyState";
import StatusBadge from "../components/StatusBadge";
import { fetchAdmin, getUsers, patchAdmin, postAdmin, updateUser } from "../services/api";

const emptyBranding = { primary_color: "#4f46e5", logo_url: "", custom_footer: "" };
const emptyOrg = { name: "", domain: "", enabled: true, branding: emptyBranding };

export default function OrganizationsPage() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(emptyOrg);
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [viewing, setViewing] = useState(null);
  const [orgUsers, setOrgUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [editing, setEditing] = useState(null);
  const [memberEmail, setMemberEmail] = useState("");
  const [assigning, setAssigning] = useState(false);

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

  const saveEdit = async () => {
    try {
      await patchAdmin(`/enterprise/organizations/${editing._id}`, {
        name: editing.name,
        domain: editing.domain,
        enabled: editing.enabled,
        branding: editing.branding || emptyBranding,
      });
      setEditing(null);
      setMessage("Organization updated");
      load();
    } catch (error) {
      setMessage(error.response?.data?.detail || "Update failed");
    }
  };

  const toggleEnabled = async (org) => {
    try {
      await patchAdmin(`/enterprise/organizations/${org._id}`, { enabled: org.enabled === false });
      setMessage(org.enabled === false ? "Organization enabled" : "Organization disabled");
      load();
    } catch (error) {
      setMessage(error.response?.data?.detail || "Update failed");
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

  const assignMember = async () => {
    if (!memberEmail.trim()) return;
    setAssigning(true);
    try {
      const { items: matches } = await getUsers({ search: memberEmail.trim(), page: 1, page_size: 5 });
      const match = matches.find((u) => u.email?.toLowerCase() === memberEmail.trim().toLowerCase());
      if (!match) {
        setMessage(`No user found with email ${memberEmail}`);
        return;
      }
      await updateUser(match.user_id, { org_id: viewing._id });
      setMemberEmail("");
      setMessage(`${match.email} added to ${viewing.name}`);
      viewUsers(viewing);
    } catch (error) {
      setMessage(error.response?.data?.detail || "Could not assign member");
    } finally {
      setAssigning(false);
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
            <label><span>Primary color</span><input type="color" value={form.branding.primary_color} onChange={(e) => setForm({ ...form, branding: { ...form.branding, primary_color: e.target.value } })} /></label>
            <label><span>Logo URL</span><input value={form.branding.logo_url} onChange={(e) => setForm({ ...form, branding: { ...form.branding, logo_url: e.target.value } })} placeholder="https://..." /></label>
            <label><span>Custom footer text</span><input value={form.branding.custom_footer} onChange={(e) => setForm({ ...form, branding: { ...form.branding, custom_footer: e.target.value } })} /></label>
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
                <td><button className="admin-status-toggle" onClick={() => toggleEnabled(org)} title="Click to toggle"><StatusBadge value={org.enabled === false ? "disabled" : "active"} /></button></td>
                <td>{org.created_at ? new Date(org.created_at).toLocaleDateString() : "-"}</td>
                <td>
                  <div className="admin-row-actions">
                    <button title="Edit" onClick={() => setEditing({ ...org, branding: org.branding || emptyBranding })}><Edit3 size={15} /></button>
                    <button title="View / manage members" onClick={() => viewUsers(org)}><Users size={15} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table></div></section>
      )}

      {editing && (
        <div className="admin-modal-backdrop" onMouseDown={() => setEditing(null)}>
          <section className="admin-modal" onMouseDown={(e) => e.stopPropagation()}>
            <header><div><span>Organization</span><h2>Edit {editing.name}</h2></div><button onClick={() => setEditing(null)}><X /></button></header>
            <label>Name<input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></label>
            <label>Domain<input value={editing.domain} onChange={(e) => setEditing({ ...editing, domain: e.target.value })} /></label>
            <label>Primary color<input type="color" value={editing.branding.primary_color} onChange={(e) => setEditing({ ...editing, branding: { ...editing.branding, primary_color: e.target.value } })} /></label>
            <label>Logo URL<input value={editing.branding.logo_url || ""} onChange={(e) => setEditing({ ...editing, branding: { ...editing.branding, logo_url: e.target.value } })} /></label>
            <label>Custom footer text<input value={editing.branding.custom_footer || ""} onChange={(e) => setEditing({ ...editing, branding: { ...editing.branding, custom_footer: e.target.value } })} /></label>
            <label className="admin-check-row">
              <input type="checkbox" checked={editing.enabled !== false} onChange={(e) => setEditing({ ...editing, enabled: e.target.checked })} />
              Active / Enabled
            </label>
            <button className="admin-button admin-button--primary" onClick={saveEdit}>Save changes</button>
          </section>
        </div>
      )}

      {viewing && (
        <div className="admin-modal-backdrop" onMouseDown={() => setViewing(null)}>
          <section className="admin-modal admin-modal--wide" onMouseDown={(e) => e.stopPropagation()}>
            <header><div><span>Organization</span><h2>{viewing.name} — members</h2></div><button onClick={() => setViewing(null)}><X /></button></header>

            <div className="admin-toolbar" style={{ marginBottom: 12 }}>
              <label style={{ flex: 1 }}>
                <input value={memberEmail} onChange={(e) => setMemberEmail(e.target.value)} placeholder="Add member by exact email" onKeyDown={(e) => e.key === "Enter" && assignMember()} />
              </label>
              <button className="admin-button admin-button--primary" disabled={assigning} onClick={assignMember}>Add member</button>
            </div>

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
