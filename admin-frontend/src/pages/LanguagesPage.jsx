import { Edit3, Globe, Plus, Search, X, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import AdminPageHeader from "../components/AdminPageHeader";
import EmptyState from "../components/EmptyState";
import StatusBadge from "../components/StatusBadge";
import { getModule, updateModuleItem } from "../services/api";
import axios from "axios";

export default function LanguagesPage() {
  const [items, setItems] = useState([]);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const load = () => {
    setLoading(true);
    getModule("languages")
      .then((data) => { setItems(data.items || []); setMessage(""); })
      .catch((error) => setMessage(error.response?.data?.detail || "Could not load languages"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const handleSync = async () => {
    setSyncing(true);
    setMessage("Syncing languages from LibreTranslate...");
    try {
      const apiBase = import.meta.env.VITE_ADMIN_API_URL || "";
      await axios.post(`${apiBase}/api/admin/languages/sync`, {}, { withCredentials: true });
      setMessage("Languages synced successfully");
      load();
    } catch (error) {
      setMessage(error.response?.data?.detail || "Failed to sync languages");
    } finally {
      setSyncing(false);
    }
  };

  const handleToggle = async (language, key, checked) => {
    try {
      const body = {
        name: language.name,
        native_name: language.native_name,
        flag: language.flag,
        enabled: key === "enabled" ? checked : language.enabled !== false,
        stt_enabled: key === "stt_enabled" ? checked : language.stt_enabled !== false,
        translation_enabled: key === "translation_enabled" ? checked : language.translation_enabled !== false,
        tts_enabled: key === "tts_enabled" ? checked : language.tts_enabled !== false,
      };
      await updateModuleItem("languages", language.code || language.key, body);
      setItems((prev) => prev.map((item) => (item.code === language.code || item.key === language.key) ? { ...item, ...body } : item));
    } catch (error) {
      setMessage(error.response?.data?.detail || "Update failed");
    }
  };

  const save = async () => {
    const body = {
      name: editing.name,
      native_name: editing.native_name,
      flag: editing.flag,
      enabled: editing.enabled !== false,
      stt_enabled: editing.stt_enabled !== false,
      translation_enabled: editing.translation_enabled !== false,
      tts_enabled: editing.tts_enabled !== false,
    };
    try {
      await updateModuleItem("languages", editing.code || editing.key, body);
      setEditing(null);
      setMessage("Language changes saved");
      load();
    } catch (error) {
      setMessage(error.response?.data?.detail || "Save failed");
    }
  };

  const filtered = items.filter((item) => 
    JSON.stringify(item).toLowerCase().includes(query.toLowerCase())
  );

  return (
    <>
      <AdminPageHeader eyebrow="Localization" title="Languages" description="Manage language availability across Speech recognition, Text translation, and Synthesized audio.">
        <button 
          className="admin-button admin-button--primary" 
          disabled={syncing}
          onClick={handleSync}
        >
          <RefreshCw size={15} className={syncing ? "spin-animation" : ""} />
          {syncing ? "Syncing..." : "Sync Languages"}
        </button>
      </AdminPageHeader>
      
      {message && <div className="admin-alert">{message}<button onClick={() => setMessage("")}><X size={14} /></button></div>}
      
      <section className="admin-toolbar">
        <label>
          <Search size={16} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search languages" />
        </label>
      </section>

      {loading ? (
        <div className="admin-skeleton" />
      ) : filtered.length === 0 ? (
        <EmptyState />
      ) : (
        <section className="admin-table-panel">
          <div className="admin-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Display Name</th>
                  <th>Native Name</th>
                  <th>Code</th>
                  <th>Flag (ISO)</th>
                  <th>Enabled</th>
                  <th>Speech Recognition</th>
                  <th>Text Translation</th>
                  <th>Translated Speech</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => (
                  <tr key={item.code || item.key}>
                    <td><strong>{item.name}</strong></td>
                    <td>{item.native_name || "-"}</td>
                    <td><code>{item.code || item.key}</code></td>
                    <td>
                      <span className="admin-avatar admin-avatar--small" style={{ fontSize: "11px", fontWeight: "bold" }}>
                        {item.flag || (item.code || item.key).toUpperCase()}
                      </span>
                    </td>
                    <td>
                      <input 
                        type="checkbox" 
                        checked={item.enabled !== false} 
                        onChange={(e) => handleToggle(item, "enabled", e.target.checked)}
                      />
                    </td>
                    <td>
                      <input 
                        type="checkbox" 
                        checked={item.stt_enabled !== false} 
                        onChange={(e) => handleToggle(item, "stt_enabled", e.target.checked)}
                      />
                    </td>
                    <td>
                      <input 
                        type="checkbox" 
                        checked={item.translation_enabled !== false} 
                        onChange={(e) => handleToggle(item, "translation_enabled", e.target.checked)}
                      />
                    </td>
                    <td>
                      <input 
                        type="checkbox" 
                        checked={item.tts_enabled !== false} 
                        onChange={(e) => handleToggle(item, "tts_enabled", e.target.checked)}
                      />
                    </td>
                    <td>
                      <div className="admin-row-actions">
                        <button title="Edit display properties" onClick={() => setEditing({ ...item })}>
                          <Edit3 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {editing && (
        <div className="admin-modal-backdrop" onMouseDown={() => setEditing(null)}>
          <section className="admin-modal" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div>
                <span>Edit Language settings</span>
                <h2>{editing.name}</h2>
              </div>
              <button onClick={() => setEditing(null)}><X /></button>
            </header>
            
            <label>Display Name
              <input value={editing.name || ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </label>
            
            <label>Native Name
              <input value={editing.native_name || ""} onChange={(e) => setEditing({ ...editing, native_name: e.target.value })} />
            </label>
            
            <label>Flag Code (ISO country code)
              <input value={editing.flag || ""} onChange={(e) => setEditing({ ...editing, flag: e.target.value.toUpperCase() })} maxLength={3} />
            </label>
            
            <button className="admin-button admin-button--primary" onClick={save}>Save changes</button>
          </section>
        </div>
      )}
    </>
  );
}
