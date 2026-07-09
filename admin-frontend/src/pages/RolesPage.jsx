import { Copy, Plus, Save, ShieldCheck, Trash2, UserPlus, X } from "lucide-react";
import { useEffect, useState } from "react";
import AdminPageHeader from "../components/AdminPageHeader";
import { createAdminInvitation, createRole, deleteRole, getModule, updateRole } from "../services/api";

export default function RolesPage() {
  const [roles, setRoles] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [selectedKey, setSelectedKey] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [invitation, setInvitation] = useState(null);
  const [creating, setCreating] = useState(false);
  const [newRole, setNewRole] = useState({ key: "", name: "", description: "", permissions: [] });
  const [message, setMessage] = useState("");
  const load = () => getModule("roles").then((data) => { setRoles(data.items || []); setPermissions(data.available_permissions || []); setSelectedKey((key) => key || data.items?.[0]?.key || ""); }).catch((error) => setMessage(error.response?.data?.detail || "Could not load roles"));
  useEffect(load, []);
  const selected = roles.find((role) => role.key === selectedKey);
  const toggle = (permission) => setRoles((current) => current.map((role) => role.key !== selectedKey ? role : { ...role, permissions: role.permissions.includes(permission) ? role.permissions.filter((item) => item !== permission) : [...role.permissions, permission] }));
  const save = async () => {
    try { await updateRole(selected.key, { name: selected.name, description: selected.description, permissions: selected.permissions }); setMessage("Role saved"); load(); }
    catch (error) { setMessage(error.response?.data?.detail || "Role save failed"); }
  };
  const addRole = async () => {
    try { await createRole(newRole); setCreating(false); setNewRole({ key: "", name: "", description: "", permissions: [] }); setMessage("Role created"); load(); }
    catch (error) { setMessage(error.response?.data?.detail || "Role creation failed"); }
  };
  const removeRole = async () => {
    if (!selected || !window.confirm(`Delete ${selected.name}?`)) return;
    try { await deleteRole(selected.key); setSelectedKey(""); setMessage("Role deleted"); load(); }
    catch (error) { setMessage(error.response?.data?.detail || "Role delete failed"); }
  };
  const createInvite = async () => {
    const result = await createAdminInvitation({ email: inviteEmail || null });
    setInvitation(result);
  };
  return <><AdminPageHeader eyebrow="Security" title="Roles & Permissions" description="Apply least-privilege administration using explicit capability guards."><button className="admin-button admin-button--secondary" onClick={() => setCreating(true)}><Plus size={15} />Create role</button><button className="admin-button admin-button--secondary" onClick={() => { setInviteOpen(true); setInvitation(null); }}><UserPlus size={15} />Invite admin</button><button className="admin-button admin-button--secondary" onClick={removeRole} disabled={!selected || selected.system}><Trash2 size={15} />Delete role</button><button className="admin-button admin-button--primary" onClick={save} disabled={!selected}><Save size={15} />Save role</button></AdminPageHeader>
    {message && <div className="admin-alert">{message}<button onClick={() => setMessage("")}><X size={14} /></button></div>}
    <section className="admin-editor-layout"><aside className="admin-section-list"><header><ShieldCheck size={17} /><strong>Admin roles</strong></header>{roles.map((role) => <button key={role.key} className={role.key === selectedKey ? "is-active" : ""} onClick={() => setSelectedKey(role.key)}><span><strong>{role.name}</strong><small>{role.permissions.length} permissions</small></span></button>)}</aside>
      <article className="admin-content-editor">{selected && <><header><div><span>Permission policy</span><h2>{selected.name}</h2><p>{selected.description}</p></div></header><div className="admin-permission-grid">{permissions.map((permission) => <label key={permission}><input type="checkbox" checked={selected.permissions.includes(permission)} onChange={() => toggle(permission)} /><span><strong>{permission.split(".")[0]}</strong><small>{permission}</small></span></label>)}</div></>}</article>
    </section>
    {inviteOpen && <div className="admin-modal-backdrop" onMouseDown={() => setInviteOpen(false)}><section className="admin-modal" onMouseDown={(event) => event.stopPropagation()}><header><div><span>Controlled access</span><h2>Create admin invitation</h2></div><button onClick={() => setInviteOpen(false)}><X /></button></header>
      {!invitation ? <><p>Optionally bind this one-time code to an email address. It expires automatically.</p><label>Administrator email<input type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="admin@company.com" /></label><button className="admin-button admin-button--primary" onClick={createInvite}><UserPlus size={15} />Generate invitation</button></> :
        <><div className="admin-invite-code"><small>One-time invitation code</small><code>{invitation.invitation_code}</code></div><p>Expires {new Date(invitation.expires_at).toLocaleString()}. This code is shown only once.</p><button className="admin-button admin-button--secondary" onClick={() => navigator.clipboard.writeText(invitation.invitation_code)}><Copy size={15} />Copy code</button></>}
    </section></div>}
    {creating && <div className="admin-modal-backdrop" onMouseDown={() => setCreating(false)}><section className="admin-modal" onMouseDown={(event) => event.stopPropagation()}><header><div><span>RBAC</span><h2>Create role</h2></div><button onClick={() => setCreating(false)}><X /></button></header>
      <label>Key<input value={newRole.key} onChange={(event) => setNewRole({ ...newRole, key: event.target.value })} placeholder="regional_support" /></label>
      <label>Name<input value={newRole.name} onChange={(event) => setNewRole({ ...newRole, name: event.target.value })} placeholder="Regional Support" /></label>
      <label>Description<textarea value={newRole.description} onChange={(event) => setNewRole({ ...newRole, description: event.target.value })} /></label>
      <button className="admin-button admin-button--primary" onClick={addRole}>Create role</button>
    </section></div>}
  </>;
}
