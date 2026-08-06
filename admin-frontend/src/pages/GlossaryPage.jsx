import { Plus, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import AdminPageHeader from "../components/AdminPageHeader";
import EmptyState from "../components/EmptyState";
import { deleteAdmin, fetchAdmin, postAdmin } from "../services/api";

const emptyEntry = {
  source_term: "", target_term: "", language: "", industry: "General",
  priority: 1, case_sensitive: false, notes: "", enabled: true,
};

export default function GlossaryPage() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(emptyEntry);
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    fetchAdmin("/platform/glossary")
      .then((data) => { setItems(data.items || []); setMessage(""); })
      .catch((error) => setMessage(error.response?.data?.detail || "Could not load glossary"))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!form.source_term.trim() || !form.target_term.trim() || !form.language.trim()) {
      setMessage("Source term, target term, and language are required");
      return;
    }
    try {
      await postAdmin("/platform/glossary", form);
      setForm(emptyEntry);
      setShowForm(false);
      setMessage("Glossary entry saved");
      load();
    } catch (error) {
      setMessage(error.response?.data?.detail || "Save failed");
    }
  };

  const remove = async (entry) => {
    if (!window.confirm(`Delete "${entry.source_term} → ${entry.target_term}"?`)) return;
    try {
      await deleteAdmin(`/platform/glossary/${entry._id || entry.id}`);
      load();
    } catch (error) {
      setMessage(error.response?.data?.detail || "Delete failed");
    }
  };

  return (
    <>
      <AdminPageHeader
        eyebrow="Translation"
        title="Glossary"
        description="Force specific terms (product names, jargon, proper nouns) to translate a fixed way instead of leaving it to the machine translation engine."
      >
        <button className="admin-button admin-button--primary" onClick={() => setShowForm((v) => !v)}>
          <Plus size={15} />Add term
        </button>
      </AdminPageHeader>

      {message && <div className="admin-alert">{message}<button onClick={() => setMessage("")}><X size={14} /></button></div>}

      {showForm && (
        <section className="admin-settings-panel" style={{ marginBottom: 16 }}>
          <header><span>New entry</span><h2>Glossary term</h2></header>
          <div className="admin-form-grid">
            <label><span>Source term</span><input value={form.source_term} onChange={(e) => setForm({ ...form, source_term: e.target.value })} /></label>
            <label><span>Target term</span><input value={form.target_term} onChange={(e) => setForm({ ...form, target_term: e.target.value })} /></label>
            <label><span>Language (target)</span><input value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })} placeholder="e.g. hi, es, fr" /></label>
            <label><span>Industry</span><input value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} /></label>
            <label><span>Priority</span><input type="number" value={form.priority} onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })} /></label>
            <label className="admin-check-row"><input type="checkbox" checked={form.case_sensitive} onChange={(e) => setForm({ ...form, case_sensitive: e.target.checked })} />Case sensitive</label>
            <label style={{ gridColumn: "span 2" }}><span>Notes</span><input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
          </div>
          <button className="admin-button admin-button--primary" style={{ marginTop: 12 }} onClick={save}>Save entry</button>
        </section>
      )}

      {loading ? <div className="admin-skeleton" /> : items.length === 0 ? <EmptyState /> : (
        <section className="admin-table-panel"><div className="admin-table-scroll"><table>
          <thead><tr><th>Source</th><th>Target</th><th>Language</th><th>Industry</th><th>Priority</th><th>Actions</th></tr></thead>
          <tbody>
            {items.map((item) => (
              <tr key={item._id || item.id}>
                <td><strong>{item.source_term}</strong></td>
                <td>{item.target_term}</td>
                <td>{item.language}</td>
                <td>{item.industry}</td>
                <td>{item.priority}</td>
                <td><div className="admin-row-actions"><button className="is-danger" title="Delete" onClick={() => remove(item)}><Trash2 size={15} /></button></div></td>
              </tr>
            ))}
          </tbody>
        </table></div></section>
      )}
    </>
  );
}
