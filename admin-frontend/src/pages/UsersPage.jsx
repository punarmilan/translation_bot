import { Download, Edit3, Eye, KeyRound, Plus, Search, ShieldCheck, Trash2, UserRoundCheck, UserRoundX, X } from "lucide-react";
import { useEffect, useState } from "react";
import AdminPageHeader from "../components/AdminPageHeader";
import EmptyState from "../components/EmptyState";
import StatusBadge from "../components/StatusBadge";
import { createUser, exportUsers, getUserActivity, getUsers, updateUser, userAction } from "../services/api";

const blankUser = {
  name: "",
  email: "",
  password: "",
  role: "participant",
  preferred_language: "en",
  pronouns: "",
  voice_preference: "auto",
};

export default function UsersPage() {
  const [data, setData] = useState({ items: [], total: 0 });
  const [filters, setFilters] = useState({ search: "", role: "", status: "", page: 1, page_size: 20 });
  const [selected, setSelected] = useState(null);
  const [activity, setActivity] = useState(null);
  const [creating, setCreating] = useState(false);
  const [newUser, setNewUser] = useState(blankUser);
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    getUsers(filters)
      .then((payload) => {
        setData(payload);
        setMessage("");
      })
      .catch((error) => {
        setMessage(error.response?.data?.detail || "Could not load users");
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    load();
  }, [filters.page, filters.role, filters.status]);

  const act = async (user, action) => {
    if (["delete", "disable", "promote", "reset-password"].includes(action) && !window.confirm(`Confirm ${action.replace("-", " ")} for ${user.email}?`)) return;
    try {
      await userAction(user.user_id, action);
      setMessage(`${action.replace("-", " ")} completed`);
      setSelected(null);
      load();
    } catch (error) {
      setMessage(error.response?.data?.detail || `Action ${action} failed`);
    }
  };

  const view = async (user) => {
    setSelected(user);
    setEditing(false);
    try {
      setActivity(await getUserActivity(user.user_id));
    } catch {
      setActivity(null);
    }
  };

  const save = async () => {
    try {
      await updateUser(selected.user_id, { name: selected.name, role: selected.role, preferred_language: selected.preferred_language, admin_role: selected.role === "admin" ? selected.admin_role || "administrator" : null });
      setEditing(false);
      setMessage("User updated");
      load();
    } catch (error) {
      setMessage(error.response?.data?.detail || "Save failed");
    }
  };

  const addUser = async () => {
    try {
      await createUser(newUser);
      setCreating(false);
      setNewUser(blankUser);
      setMessage("User created");
      load();
    } catch (error) {
      setMessage(error.response?.data?.detail || "Create user failed");
    }
  };

  const downloadCsv = async () => {
    try {
      const blob = await exportUsers(filters);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "translation-bot-users.csv";
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setMessage("Export CSV failed");
    }
  };

  return (
    <>
      <AdminPageHeader eyebrow="Identity" title="Users" description="Search accounts, review profile settings, and apply audited administrative actions.">
        <button className="admin-button admin-button--secondary" onClick={downloadCsv}><Download size={15} />Export CSV</button>
        <button className="admin-button admin-button--primary" onClick={() => setCreating(true)}><Plus size={15} />Add user</button>
      </AdminPageHeader>
      
      {message && <div className="admin-alert">{message}<button onClick={() => setMessage("")}><X size={14} /></button></div>}
      
      <section className="admin-toolbar">
        <label><Search size={16} /><input value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} onKeyDown={(e) => e.key === "Enter" && load()} placeholder="Search name, username, or email" /></label>
        <select value={filters.role} onChange={(e) => setFilters({ ...filters, role: e.target.value, page: 1 })}><option value="">All roles</option><option>admin</option><option>host</option><option>participant</option></select>
        <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value, page: 1 })}><option value="">All statuses</option><option>online</option><option>active</option><option>disabled</option></select>
        <select value={filters.sort_by || "created_at"} onChange={(e) => setFilters({ ...filters, sort_by: e.target.value, page: 1 })}><option value="created_at">Newest</option><option value="name">Name</option><option value="email">Email</option><option value="role">Role</option><option value="preferred_language">Language</option></select>
        <button className="admin-button admin-button--primary" onClick={load}>Search</button>
      </section>

      {loading ? (
        <div className="admin-skeleton" style={{ height: "180px" }} />
      ) : data.items.length === 0 ? (
        <EmptyState title="No users found" description="Adjust your filters or add a new user account." />
      ) : (
        <section className="admin-table-panel">
          <div className="admin-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Language</th>
                  <th>Meetings</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((user) => (
                  <tr key={user.user_id}>
                    <td>
                      <div className="admin-user-cell">
                        <span className="admin-avatar">{(user.name || "U")[0]}</span>
                        <div>
                          <strong>{user.name}</strong>
                          <small>{user.email}</small>
                        </div>
                      </div>
                    </td>
                    <td>{user.role}</td>
                    <td>{user.preferred_language.toUpperCase()}</td>
                    <td>{user.meetings_joined}</td>
                    <td><StatusBadge value={user.status} /></td>
                    <td>{user.created_at ? new Date(user.created_at).toLocaleDateString() : "-"}</td>
                    <td>
                      <div className="admin-row-actions">
                        <button title="View" onClick={() => view(user)}><Eye size={15} /></button>
                        <button title="Edit" onClick={() => { setSelected(user); setEditing(true); setActivity(null); }}><Edit3 size={15} /></button>
                        {user.status === "disabled" ? (
                          <button title="Activate" onClick={() => act(user, "activate")}><UserRoundCheck size={15} /></button>
                        ) : (
                          <button title="Disable" onClick={() => act(user, "disable")}><UserRoundX size={15} /></button>
                        )}
                        <button title="Promote" onClick={() => act(user, "promote")}><ShieldCheck size={15} /></button>
                        <button title="Reset password" onClick={() => act(user, "reset-password")}><KeyRound size={15} /></button>
                        <button title="Delete" className="is-danger" onClick={() => act(user, "delete")}><Trash2 size={15} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <footer>
            <span>{data.total} users</span>
            <div>
              <button disabled={filters.page === 1} onClick={() => setFilters({ ...filters, page: filters.page - 1 })}>
                Previous
              </button>
              <b>Page {filters.page}</b>
              <button disabled={filters.page * filters.page_size >= data.total} onClick={() => setFilters({ ...filters, page: filters.page + 1 })}>
                Next
              </button>
            </div>
          </footer>
        </section>
      )}

      {selected && (
        <div className="admin-modal-backdrop" onMouseDown={() => setSelected(null)}>
          <section className="admin-modal" onMouseDown={(e) => e.stopPropagation()}>
            <header>
              <div>
                <span>User record</span>
                <h2>{selected.name}</h2>
              </div>
              <button onClick={() => setSelected(null)}><X /></button>
            </header>
            
            <label>Name<input disabled={!editing} value={selected.name} onChange={(e) => setSelected({ ...selected, name: e.target.value })} /></label>
            <label>Email<input disabled value={selected.email} /></label>
            <label>Role
              <select disabled={!editing} value={selected.role} onChange={(e) => setSelected({ ...selected, role: e.target.value })}>
                <option>admin</option>
                <option>host</option>
                <option>participant</option>
              </select>
            </label>
            
            {selected.role === "admin" && (
              <label>Admin role
                <select disabled={!editing} value={selected.admin_role || "administrator"} onChange={(e) => setSelected({ ...selected, admin_role: e.target.value })}>
                  <option value="administrator">Administrator</option>
                  <option value="support">Support</option>
                  <option value="content_editor">Content editor</option>
                </select>
              </label>
            )}
            
            <label>Preferred language<input disabled={!editing} value={selected.preferred_language} onChange={(e) => setSelected({ ...selected, preferred_language: e.target.value })} /></label>
            
            {activity && (
              <div className="admin-record-summary">
                <strong>Meeting history</strong>
                <span>{activity.meeting_history.length} recent meetings</span>
                <strong>Translation usage</strong>
                <span>{activity.translation_usage?.total_translation_events ?? 0} translation events</span>
              </div>
            )}
            
            {editing && <button className="admin-button admin-button--primary" onClick={save}>Save changes</button>}
          </section>
        </div>
      )}

      {creating && (
        <div className="admin-modal-backdrop" onMouseDown={() => setCreating(false)}>
          <section className="admin-modal" onMouseDown={(e) => e.stopPropagation()}>
            <header>
              <div>
                <span>New account</span>
                <h2>Add user</h2>
              </div>
              <button onClick={() => setCreating(false)}><X /></button>
            </header>
            
            <label>Name<input value={newUser.name} onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} /></label>
            <label>Email<input type="email" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} /></label>
            <label>Temporary password<input type="password" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} /></label>
            <label>Role
              <select value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}>
                <option>participant</option>
                <option>host</option>
                <option>admin</option>
              </select>
            </label>
            <label>Preferred language<input value={newUser.preferred_language} onChange={(e) => setNewUser({ ...newUser, preferred_language: e.target.value })} /></label>
            <label>Voice preference
              <select value={newUser.voice_preference} onChange={(e) => setNewUser({ ...newUser, voice_preference: e.target.value })}>
                <option>auto</option>
                <option>feminine</option>
                <option>masculine</option>
                <option>neutral</option>
              </select>
            </label>
            
            <button className="admin-button admin-button--primary" onClick={addUser}>Create user</button>
          </section>
        </div>
      )}
    </>
  );
}
