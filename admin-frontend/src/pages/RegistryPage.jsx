import { Edit3, Plus, Search, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import AdminPageHeader from "../components/AdminPageHeader";
import EmptyState from "../components/EmptyState";
import StatusBadge from "../components/StatusBadge";
import { createModuleItem, deleteModuleItem, getModule, updateModuleItem } from "../services/api";

const emptyItem = { key: "", name: "", description: "", enabled: true, value: "" };

export default function RegistryPage({ module, eyebrow, title, description, canCreate = true, canDelete = true }) {
  const [items, setItems] = useState([]);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const load = () => {
    setLoading(true);
    return getModule(module)
      .then((data) => { setItems(data.items || []); setMessage(""); })
      .catch((error) => setMessage(error.response?.data?.detail || `Could not load ${title}`))
      .finally(() => setLoading(false));
  };
  useEffect(load, [module]);

  const save = async () => {
    const value = editing.value;
    let parsedValue = value;
    if (typeof value === "string") {
      try { parsedValue = JSON.parse(value); } catch { parsedValue = value; }
    }
    const body = {
      key: editing.key, name: editing.name, description: editing.description,
      enabled: editing.enabled, status: editing.status, value: parsedValue,
      stt_enabled: editing.stt_enabled, translation_enabled: editing.translation_enabled,
      tts_enabled: editing.tts_enabled,
    };
    const itemId = editing._id || editing.code || editing.key;
    try {
      if (editing.isNew) await createModuleItem(module, body);
      else await updateModuleItem(module, itemId, body);
      setEditing(null); setMessage("Changes saved"); load();
    } catch (error) {
      setMessage(error.response?.data?.detail || "Save failed");
    }
  };
  const remove = async (item) => {
    if (!window.confirm(`Delete ${item.name || item.key}?`)) return;
    try { await deleteModuleItem(module, item._id); load(); }
    catch (error) { setMessage(error.response?.data?.detail || "Delete failed"); }
  };
  const filtered = items.filter((item) => JSON.stringify(item).toLowerCase().includes(query.toLowerCase()));

  return <>
    <AdminPageHeader eyebrow={eyebrow} title={title} description={description}>
      {canCreate && <button className="admin-button admin-button--primary" onClick={() => setEditing({ ...emptyItem, isNew: true })}><Plus size={15} />Add item</button>}
    </AdminPageHeader>
    {message && <div className="admin-alert">{message}<button onClick={() => setMessage("")}><X size={14} /></button></div>}
    <section className="admin-toolbar"><label><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${title.toLowerCase()}`} /></label></section>
    {loading ? <div className="admin-skeleton" /> : filtered.length === 0 ? <EmptyState /> : <section className="admin-table-panel"><div className="admin-table-scroll"><table><thead><tr><th>Name</th><th>Key</th><th>Status</th><th>Description / Value</th><th>Updated</th><th>Actions</th></tr></thead><tbody>
      {filtered.map((item) => <tr key={item._id || item.code || item.key}><td><strong>{item.name || item.title || item.key}</strong></td><td>{item.code || item.key || "-"}</td><td><StatusBadge value={item.status || (item.enabled === false ? "disabled" : "active")} /></td><td className="admin-table-description">{item.description || (item.value != null ? JSON.stringify(item.value) : "-")}</td><td>{item.updated_at ? new Date(item.updated_at).toLocaleDateString() : "-"}</td><td><div className="admin-row-actions"><button title="Edit" onClick={() => setEditing({ ...item, value: typeof item.value === "object" ? JSON.stringify(item.value, null, 2) : item.value ?? "" })}><Edit3 size={15} /></button>{canDelete && <button className="is-danger" title="Delete" onClick={() => remove(item)}><Trash2 size={15} /></button>}</div></td></tr>)}
    </tbody></table></div></section>}
    {editing && <div className="admin-modal-backdrop" onMouseDown={() => setEditing(null)}><section className="admin-modal" onMouseDown={(event) => event.stopPropagation()}><header><div><span>{title}</span><h2>{editing.isNew ? "Add item" : "Edit item"}</h2></div><button onClick={() => setEditing(null)}><X /></button></header>
      <label>Key<input disabled={!editing.isNew} value={editing.key || editing.code || ""} onChange={(event) => setEditing({ ...editing, key: event.target.value })} /></label>
      <label>Name<input value={editing.name || ""} onChange={(event) => setEditing({ ...editing, name: event.target.value })} /></label>
      <label>Description<textarea value={editing.description || ""} onChange={(event) => setEditing({ ...editing, description: event.target.value })} /></label>
      <label className="admin-check-row"><input type="checkbox" checked={editing.enabled !== false} onChange={(event) => setEditing({ ...editing, enabled: event.target.checked })} />Enabled</label>
      {editing.stt_enabled != null && <label className="admin-check-row"><input type="checkbox" checked={editing.stt_enabled} onChange={(event) => setEditing({ ...editing, stt_enabled: event.target.checked })} />Speech recognition</label>}
      {editing.translation_enabled != null && <label className="admin-check-row"><input type="checkbox" checked={editing.translation_enabled} onChange={(event) => setEditing({ ...editing, translation_enabled: event.target.checked })} />Text translation</label>}
      {editing.tts_enabled != null && <label className="admin-check-row"><input type="checkbox" checked={editing.tts_enabled} onChange={(event) => setEditing({ ...editing, tts_enabled: event.target.checked })} />Translated speech</label>}
      {editing.status != null && <label>Status<select value={editing.status} onChange={(event) => setEditing({ ...editing, status: event.target.value })}><option value="new">New</option><option value="reviewing">Reviewing</option><option value="resolved">Resolved</option><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option></select></label>}
      <label>Value<textarea className="admin-code-input" value={editing.value ?? ""} onChange={(event) => setEditing({ ...editing, value: event.target.value })} /></label>
      <button className="admin-button admin-button--primary" onClick={save}>Save changes</button>
    </section></div>}
  </>;
}
