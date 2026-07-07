import { Copy, Save, ShieldCheck, UserPlus, X } from "lucide-react";
import { useEffect, useState } from "react";
import AdminPageHeader from "../components/AdminPageHeader";
import { createAdminInvitation, getModule, updateRole } from "../services/api";

export default function RolesPage() {
  const [roles, setRoles] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [selectedKey, setSelectedKey] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [invitation, setInvitation] = useState(null);
  const load = () => getModule("roles").then((data) => { setRoles(data.items || []); setPermissions(data.available_permissions || []); setSelectedKey((key) => key || data.items?.[0]?.key || ""); });
  useEffect(load, []);
  const selected = roles.find((role) => role.key === selectedKey);
  const toggle = (permission) => setRoles((current) => current.map((role) => role.key !== selectedKey ? role : { ...role, permissions: role.permissions.includes(permission) ? role.permissions.filter((item) => item !== permission) : [...role.permissions, permission] }));
  const save = async () => { await updateRole(selected.key, { name: selected.name, description: selected.description, permissions: selected.permissions }); load(); };
  const createInvite = async () => {
    const result = await createAdminInvitation({ email: inviteEmail || null });
    setInvitation(result);
  };
  return <><AdminPageHeader eyebrow="Security" title="Roles & Permissions" description="Apply least-privilege administration using explicit capability guards."><button className="admin-button admin-button--secondary" onClick={() => { setInviteOpen(true); setInvitation(null); }}><UserPlus size={15} />Invite admin</button><button className="admin-button admin-button--primary" onClick={save} disabled={!selected}><Save size={15} />Save role</button></AdminPageHeader>
    <section className="admin-editor-layout"><aside className="admin-section-list"><header><ShieldCheck size={17} /><strong>Admin roles</strong></header>{roles.map((role) => <button key={role.key} className={role.key === selectedKey ? "is-active" : ""} onClick={() => setSelectedKey(role.key)}><span><strong>{role.name}</strong><small>{role.permissions.length} permissions</small></span></button>)}</aside>
      <article className="admin-content-editor">{selected && <><header><div><span>Permission policy</span><h2>{selected.name}</h2><p>{selected.description}</p></div></header><div className="admin-permission-grid">{permissions.map((permission) => <label key={permission}><input type="checkbox" checked={selected.permissions.includes(permission)} onChange={() => toggle(permission)} /><span><strong>{permission.split(".")[0]}</strong><small>{permission}</small></span></label>)}</div></>}</article>
    </section>
    {inviteOpen && <div className="admin-modal-backdrop" onMouseDown={() => setInviteOpen(false)}><section className="admin-modal" onMouseDown={(event) => event.stopPropagation()}><header><div><span>Controlled access</span><h2>Create admin invitation</h2></div><button onClick={() => setInviteOpen(false)}><X /></button></header>
      {!invitation ? <><p>Optionally bind this one-time code to an email address. It expires automatically.</p><label>Administrator email<input type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="admin@company.com" /></label><button className="admin-button admin-button--primary" onClick={createInvite}><UserPlus size={15} />Generate invitation</button></> :
        <><div className="admin-invite-code"><small>One-time invitation code</small><code>{invitation.invitation_code}</code></div><p>Expires {new Date(invitation.expires_at).toLocaleString()}. This code is shown only once.</p><button className="admin-button admin-button--secondary" onClick={() => navigator.clipboard.writeText(invitation.invitation_code)}><Copy size={15} />Copy code</button></>}
    </section></div>}
  </>;
}
