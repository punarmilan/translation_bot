import { Edit3, Eye, Search, ShieldCheck, Trash2, UserRoundX, KeyRound, X } from "lucide-react";
import { useEffect, useState } from "react";
import AdminPageHeader from "../components/AdminPageHeader";
import StatusBadge from "../components/StatusBadge";
import { getUsers, updateUser, userAction } from "../services/api";

export default function UsersPage() {
  const [data, setData] = useState({ items: [], total: 0 });
  const [filters, setFilters] = useState({ search: "", role: "", status: "", page: 1, page_size: 20 });
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState("");
  const load = () => getUsers(filters).then(setData).catch((error) => setMessage(error.response?.data?.detail || "Could not load users"));
  useEffect(load, [filters.page, filters.role, filters.status]);

  const act = async (user, action) => {
    if (["delete", "disable", "promote", "reset-password"].includes(action) && !window.confirm(`Confirm ${action.replace("-", " ")} for ${user.email}?`)) return;
    await userAction(user.user_id, action);
    setMessage(`${action.replace("-", " ")} completed`);
    setSelected(null);
    load();
  };
  const save = async () => {
    await updateUser(selected.user_id, { name: selected.name, role: selected.role, preferred_language: selected.preferred_language });
    setEditing(false); setMessage("User updated"); load();
  };

  return (
    <>
      <AdminPageHeader eyebrow="Identity" title="Users" description="Search accounts, review profile settings, and apply audited administrative actions." />
      {message && <div className="admin-alert">{message}<button onClick={() => setMessage("")}><X size={14} /></button></div>}
      <section className="admin-toolbar">
        <label><Search size={16} /><input value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} onKeyDown={(e) => e.key === "Enter" && load()} placeholder="Search name, username, or email" /></label>
        <select value={filters.role} onChange={(e) => setFilters({ ...filters, role: e.target.value, page: 1 })}><option value="">All roles</option><option>admin</option><option>host</option><option>participant</option></select>
        <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value, page: 1 })}><option value="">All statuses</option><option>online</option><option>active</option><option>disabled</option></select>
        <button className="admin-button admin-button--primary" onClick={load}>Search</button>
      </section>
      <section className="admin-table-panel">
        <div className="admin-table-scroll"><table><thead><tr><th>User</th><th>Role</th><th>Language</th><th>Meetings</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead>
        <tbody>{data.items.map((user) => <tr key={user.user_id}><td><div className="admin-user-cell"><span className="admin-avatar">{(user.name || "U")[0]}</span><div><strong>{user.name}</strong><small>{user.email}</small></div></div></td><td>{user.role}</td><td>{user.preferred_language.toUpperCase()}</td><td>{user.meetings_joined}</td><td><StatusBadge value={user.status} /></td><td>{user.created_at ? new Date(user.created_at).toLocaleDateString() : "-"}</td><td><div className="admin-row-actions"><button title="View" onClick={() => { setSelected(user); setEditing(false); }}><Eye size={15} /></button><button title="Edit" onClick={() => { setSelected(user); setEditing(true); }}><Edit3 size={15} /></button><button title="Disable" onClick={() => act(user, "disable")}><UserRoundX size={15} /></button><button title="Promote" onClick={() => act(user, "promote")}><ShieldCheck size={15} /></button><button title="Reset password" onClick={() => act(user, "reset-password")}><KeyRound size={15} /></button><button title="Delete" className="is-danger" onClick={() => act(user, "delete")}><Trash2 size={15} /></button></div></td></tr>)}</tbody></table></div>
        <footer><span>{data.total} users</span><div><button disabled={filters.page === 1} onClick={() => setFilters({ ...filters, page: filters.page - 1 })}>Previous</button><b>Page {filters.page}</b><button disabled={filters.page * filters.page_size >= data.total} onClick={() => setFilters({ ...filters, page: filters.page + 1 })}>Next</button></div></footer>
      </section>
      {selected && <div className="admin-modal-backdrop" onMouseDown={() => setSelected(null)}><section className="admin-modal" onMouseDown={(e) => e.stopPropagation()}><header><div><span>User record</span><h2>{selected.name}</h2></div><button onClick={() => setSelected(null)}><X /></button></header><label>Name<input disabled={!editing} value={selected.name} onChange={(e) => setSelected({ ...selected, name: e.target.value })} /></label><label>Email<input disabled value={selected.email} /></label><label>Role<select disabled={!editing} value={selected.role} onChange={(e) => setSelected({ ...selected, role: e.target.value })}><option>admin</option><option>host</option><option>participant</option></select></label><label>Preferred language<input disabled={!editing} value={selected.preferred_language} onChange={(e) => setSelected({ ...selected, preferred_language: e.target.value })} /></label>{editing && <button className="admin-button admin-button--primary" onClick={save}>Save changes</button>}</section></div>}
    </>
  );
}
