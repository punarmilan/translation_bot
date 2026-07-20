import { Edit3, Plus, Search, RefreshCw, X, Save, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import AdminPageHeader from "../components/AdminPageHeader";
import EmptyState from "../components/EmptyState";
import StatusBadge from "../components/StatusBadge";
import { getModule, updateModuleItem, createModuleItem, deleteModuleItem } from "../services/api";
import axios from "axios";

export default function VoicesPage() {
  const [items, setItems] = useState([]);
  const [languages, setLanguages] = useState([]);
  const [routing, setRouting] = useState({});
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [savingRouting, setSavingRouting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const voicesData = await getModule("voices");
      setItems(voicesData.items || []);

      const langsData = await getModule("languages");
      setLanguages(langsData.items || []);

      const apiBase = import.meta.env.VITE_ADMIN_API_URL || "";
      const routingRes = await axios.get(`${apiBase}/api/admin/voices/routing`, { withCredentials: true });
      setRouting(routingRes.data.routing || {});
      setMessage("");
    } catch (error) {
      setMessage(error.response?.data?.detail || "Could not load voice data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleScan = async () => {
    setScanning(true);
    setMessage("Scanning Piper voices directory...");
    try {
      const apiBase = import.meta.env.VITE_ADMIN_API_URL || "";
      const res = await axios.post(`${apiBase}/api/admin/voices/scan`, {}, { withCredentials: true });
      setMessage(`Scan complete. Scanned: ${res.data.total_scanned}, Imported: ${res.data.imported_count}`);
      load();
    } catch (error) {
      setMessage(error.response?.data?.detail || "Failed to scan voices");
    } finally {
      setScanning(false);
    }
  };

  const saveRouting = async () => {
    setSavingRouting(true);
    try {
      const apiBase = import.meta.env.VITE_ADMIN_API_URL || "";
      await axios.post(`${apiBase}/api/admin/voices/routing`, { routing }, { withCredentials: true });
      setMessage("Voice routing defaults saved");
    } catch (error) {
      setMessage(error.response?.data?.detail || "Failed to save voice routing");
    } finally {
      setSavingRouting(false);
    }
  };

  const handleRoutingChange = (langCode, key, voiceKey) => {
    setRouting((prev) => ({
      ...prev,
      [langCode]: {
        ...prev[langCode],
        [key]: voiceKey,
      },
    }));
  };

  const saveVoiceEdit = async () => {
    try {
      const body = {
        name: editing.name,
        description: editing.description,
        enabled: editing.enabled !== false,
        metadata: {
          ...editing.metadata,
          gender: editing.gender,
          language: editing.language,
        },
      };
      await updateModuleItem("voices", editing._id || editing.key, body);
      setEditing(null);
      setMessage("Voice model updated");
      load();
    } catch (error) {
      setMessage(error.response?.data?.detail || "Save failed");
    }
  };

  const handleDelete = async (voice) => {
    if (!window.confirm(`Delete voice model ${voice.name}?`)) return;
    try {
      await deleteModuleItem("voices", voice._id || voice.key);
      setMessage("Voice model deleted");
      load();
    } catch (error) {
      setMessage(error.response?.data?.detail || "Delete failed");
    }
  };

  const renderVoiceSelector = (langCode, key, availableVoices) => {
    const currentVal = routing[langCode]?.[key] || "";
    if (availableVoices.length === 0) {
      return <span className="admin-status admin-status--neutral">No voices available</span>;
    }
    if (availableVoices.length === 1) {
      return <span className="admin-status admin-status--success">{availableVoices[0].name}</span>;
    }
    return (
      <select 
        value={currentVal} 
        onChange={(e) => handleRoutingChange(langCode, key, e.target.value)}
      >
        <option value="">-- No Assignment (Fallback) --</option>
        {availableVoices.map(v => <option key={v.key} value={v.key}>{v.name}</option>)}
      </select>
    );
  };

  const filtered = items.filter((item) =>
    JSON.stringify(item).toLowerCase().includes(query.toLowerCase())
  );

  return (
    <>
      <AdminPageHeader eyebrow="Speech" title="Voice Models" description="Scan local directories for Piper voice models, assign genders, and configure default routing by language.">
        <button className="admin-button admin-button--primary" disabled={scanning} onClick={handleScan}>
          <RefreshCw size={15} className={scanning ? "spin-animation" : ""} />
          {scanning ? "Scanning..." : "Scan Voices"}
        </button>
      </AdminPageHeader>

      {message && <div className="admin-alert">{message}<button onClick={() => setMessage("")}><X size={14} /></button></div>}

      <section className="admin-toolbar">
        <label>
          <Search size={16} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search voice models" />
        </label>
      </section>

      {loading ? (
        <div className="admin-skeleton" />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "2.5rem" }}>
          <section className="admin-table-panel">
            <header style={{ padding: "1rem 1.5rem", borderBottom: "1px solid var(--admin-border)" }}>
              <h3 style={{ fontSize: "1.1rem", fontWeight: "bold" }}>Scanned Piper Models</h3>
            </header>
            <div className="admin-table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Voice Key / Dataset</th>
                    <th>Display Name</th>
                    <th>Language</th>
                    <th>Gender</th>
                    <th>Quality</th>
                    <th>Size (MB)</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item) => {
                    const sizeMb = item.metadata?.size_bytes ? (item.metadata.size_bytes / (1024 * 1024)).toFixed(1) : "-";
                    return (
                      <tr key={item.key}>
                        <td><code>{item.key}</code></td>
                        <td><strong>{item.name}</strong></td>
                        <td><code>{item.metadata?.language || "-"}</code></td>
                        <td><StatusBadge value={item.metadata?.gender || "neutral"} /></td>
                        <td>{item.metadata?.quality || "medium"}</td>
                        <td>{sizeMb} MB</td>
                        <td>
                          <StatusBadge value={item.enabled !== false ? "active" : "inactive"} />
                        </td>
                        <td>
                          <div className="admin-row-actions">
                            <button title="Edit properties" onClick={() => setEditing({
                              ...item,
                              gender: item.metadata?.gender || "neutral",
                              language: item.metadata?.language || "en",
                            })}>
                              <Edit3 size={15} />
                            </button>
                            <button title="Delete voice model" className="is-danger" onClick={() => handleDelete(item)}>
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="admin-table-panel">
            <header style={{ padding: "1rem 1.5rem", borderBottom: "1px solid var(--admin-border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h3 style={{ fontSize: "1.1rem", fontWeight: "bold" }}>Default Language Voice Assignments</h3>
                <p style={{ fontSize: "0.85rem", color: "var(--admin-muted)" }}>Assign default gender specific models per language</p>
              </div>
              <button className="admin-button admin-button--primary" disabled={savingRouting} onClick={saveRouting}>
                <Save size={15} />
                {savingRouting ? "Saving..." : "Save Assignments"}
              </button>
            </header>
            <div className="admin-table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Language</th>
                    <th>Auto / Default Choice</th>
                    <th>Feminine Choice</th>
                    <th>Masculine Choice</th>
                    <th>Neutral Choice</th>
                  </tr>
                </thead>
                <tbody>
                  {languages.map((lang) => {
                    const langCode = lang.code || lang.key;
                    const availableVoices = items.filter(v => v.metadata?.language === langCode && v.enabled !== false);
                    return (
                      <tr key={langCode}>
                        <td><strong>{lang.name}</strong> (<code>{langCode}</code>)</td>
                        <td>{renderVoiceSelector(langCode, "auto", availableVoices)}</td>
                        <td>{renderVoiceSelector(langCode, "feminine", availableVoices)}</td>
                        <td>{renderVoiceSelector(langCode, "masculine", availableVoices)}</td>
                        <td>{renderVoiceSelector(langCode, "neutral", availableVoices)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {editing && (
        <div className="admin-modal-backdrop" onMouseDown={() => setEditing(null)}>
          <section className="admin-modal" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div>
                <span>Voice metadata editor</span>
                <h2>{editing.name}</h2>
              </div>
              <button onClick={() => setEditing(null)}><X /></button>
            </header>
            
            <label>Name
              <input value={editing.name || ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </label>
            
            <label>Description
              <textarea value={editing.description || ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
            </label>

            <label>Language code
              <input value={editing.language || ""} onChange={(e) => setEditing({ ...editing, language: e.target.value.toLowerCase() })} />
            </label>

            <label>Gender assignment
              <select value={editing.gender} onChange={(e) => setEditing({ ...editing, gender: e.target.value })}>
                <option value="feminine">Feminine</option>
                <option value="masculine">Masculine</option>
                <option value="neutral">Neutral</option>
              </select>
            </label>

            <label className="admin-check-row">
              <input type="checkbox" checked={editing.enabled !== false} onChange={(e) => setEditing({ ...editing, enabled: e.target.checked })} />
              Active / Enabled
            </label>
            
            <button className="admin-button admin-button--primary" onClick={saveVoiceEdit}>Save changes</button>
          </section>
        </div>
      )}
    </>
  );
}
