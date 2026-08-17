import { RefreshCw, Save } from "lucide-react";
import { useEffect, useState } from "react";
import AdminPageHeader from "../components/AdminPageHeader";
import { fetchAdmin, getModule, updateModuleSettings } from "../services/api";

const HELPERS = {
  maximum_latency_ms: "Maximum acceptable translation delay before audio is delivered.",
  translation_timeout_seconds: "Maximum time allowed for translation before request expires.",
  tts_profile: "Speech synthesis profile controlling quality and performance.",
  detection_confidence: "Minimum confidence required before detected language is accepted.",
};

/**
 * @param {string[]} [readOnlyKeys] - fields shown disabled with a "deployment-controlled" note (e.g. env-var-only settings that can't take effect from this form)
 * @param {{title: string, keys: string[]}[]} [sections] - visually groups fields under labeled headings instead of one flat list; any key not covered by a section falls into a trailing "Other" group
 * @param {string} [statusEndpoint] - admin API path (e.g. "/ai-settings/status") polled once on load for a read-only live runtime status card above the form
 */
export default function SettingsPage({ module = "settings", title = "Settings", description, eyebrow = "Configuration", readOnlyKeys = [], sections = null, statusEndpoint = null }) {
  const [values, setValues] = useState({});
  const [message, setMessage] = useState("");
  // Array-typed fields (e.g. allowed_file_extensions) are edited as a raw
  // comma-separated string and only parsed back into an array on blur/save --
  // parsing on every keystroke would eat the comma the moment it's typed.
  const [arrayDrafts, setArrayDrafts] = useState({});
  const [status, setStatus] = useState(null);
  const [statusError, setStatusError] = useState("");
  const [statusLoading, setStatusLoading] = useState(false);

  useEffect(() => {
    getModule(module).then((data) => {
      const loaded = data.values || {};
      setValues(loaded);
      setArrayDrafts(
        Object.fromEntries(
          Object.entries(loaded).filter(([, v]) => Array.isArray(v)).map(([k, v]) => [k, v.join(", ")])
        )
      );
    });
  }, [module]);

  const loadStatus = () => {
    if (!statusEndpoint) return;
    setStatusLoading(true);
    fetchAdmin(statusEndpoint)
      .then((data) => { setStatus(data); setStatusError(""); })
      .catch((error) => setStatusError(error.response?.data?.detail || "Could not load runtime status"))
      .finally(() => setStatusLoading(false));
  };

  useEffect(() => {
    loadStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusEndpoint]);

  const updateValue = (key, rawValue, currentValue) => {
    let value = rawValue;
    if (typeof currentValue === "number") value = Number(rawValue);
    if (typeof currentValue === "boolean") value = rawValue === "true";
    setValues({ ...values, [key]: value });
  };

  const commitArrayDraft = (key, rawValue) => {
    const parsed = rawValue.split(",").map((item) => item.trim()).filter(Boolean);
    setValues({ ...values, [key]: parsed });
    setArrayDrafts({ ...arrayDrafts, [key]: parsed.join(", ") });
  };

  const save = async () => {
    // Commit any array-field draft the user hasn't blurred out of yet (e.g.
    // clicking Save directly after typing) so it isn't silently dropped.
    const finalValues = { ...values };
    for (const [key, draft] of Object.entries(arrayDrafts)) {
      if (Array.isArray(values[key])) {
        finalValues[key] = draft.split(",").map((item) => item.trim()).filter(Boolean);
      }
    }
    try {
      await updateModuleSettings(module, finalValues);
      setValues(finalValues);
      setMessage("Settings saved");
    } catch (error) {
      setMessage(error.response?.data?.detail || "Failed to save settings");
    }
  };

  const renderField = (key) => {
    const value = values[key];
    const readOnly = readOnlyKeys.includes(key);
    return (
      <label key={key} style={{ display: "flex", flexDirection: "column", gap: "6px", opacity: readOnly ? 0.65 : 1 }}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontWeight: 800 }}>{key.replaceAll("_", " ")}</span>
          {readOnly ? (
            <span style={{ display: "block", fontSize: "11px", color: "var(--muted)", textTransform: "none", marginTop: "4px", fontWeight: "normal" }}>
              Deployment-controlled (environment variable on the backend process) — not editable here.
            </span>
          ) : HELPERS[key] && (
            <span style={{ display: "block", fontSize: "11px", color: "var(--muted)", textTransform: "none", marginTop: "4px", fontWeight: "normal" }}>
              {HELPERS[key]}
            </span>
          )}
        </div>
        {typeof value === "boolean" ? (
          <select disabled={readOnly} value={String(value)} onChange={(event) => updateValue(key, event.target.value, value)}>
            <option value="true">Enabled</option>
            <option value="false">Disabled</option>
          </select>
        ) : Array.isArray(value) ? (
          <input
            type="text"
            disabled={readOnly}
            value={arrayDrafts[key] ?? value.join(", ")}
            placeholder="Comma-separated, e.g. .pdf, .png, .mp4"
            onChange={(event) => setArrayDrafts({ ...arrayDrafts, [key]: event.target.value })}
            onBlur={(event) => commitArrayDraft(key, event.target.value)}
          />
        ) : (
          <input
            type={typeof value === "number" ? "number" : "text"}
            disabled={readOnly}
            value={value ?? ""}
            onChange={(event) => updateValue(key, event.target.value, value)}
          />
        )}
      </label>
    );
  };

  const sectionedKeys = sections ? new Set(sections.flatMap((section) => section.keys)) : null;
  const otherKeys = sections ? Object.keys(values).filter((key) => !sectionedKeys.has(key)) : null;

  return (
    <>
      <AdminPageHeader eyebrow={eyebrow} title={title} description={description}>
        <button className="admin-button admin-button--primary" onClick={save}>
          <Save size={15} />Save settings
        </button>
      </AdminPageHeader>

      {message && <div className="admin-alert">{message}</div>}

      {statusEndpoint && (
        <section className="admin-settings-panel" style={{ marginBottom: "1.5rem" }}>
          <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <span>Live from the running service</span>
              <h2>Runtime status</h2>
            </div>
            <button className="admin-button" disabled={statusLoading} onClick={loadStatus} title="Refresh">
              <RefreshCw size={14} className={statusLoading ? "spin-animation" : ""} />
            </button>
          </header>
          {statusError ? (
            <p style={{ fontSize: "0.85rem", color: "var(--admin-danger, #dc2626)" }}>{statusError}</p>
          ) : status ? (
            <div className="admin-form-grid">
              {Object.entries(status).map(([service, info]) => (
                <div key={service} style={{ fontSize: "0.85rem" }}>
                  <strong style={{ textTransform: "uppercase" }}>{service}</strong>
                  {info?.error ? (
                    <p style={{ color: "var(--admin-danger, #dc2626)" }}>{info.error}</p>
                  ) : (
                    <ul style={{ margin: "6px 0 0", paddingLeft: "1.1rem" }}>
                      {Object.entries(info || {}).filter(([k, v]) => typeof v !== "object").map(([k, v]) => (
                        <li key={k}>{k.replaceAll("_", " ")}: <code>{String(v)}</code></li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p style={{ fontSize: "0.85rem", color: "var(--admin-muted)" }}>Loading…</p>
          )}
        </section>
      )}

      {sections ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          {sections.map((section) => (
            <section className="admin-settings-panel" key={section.title}>
              <header>
                <span>{section.title}</span>
                <h2>{title}</h2>
              </header>
              <div className="admin-form-grid">
                {section.keys.filter((key) => key in values).map((key) => renderField(key))}
              </div>
            </section>
          ))}
          {otherKeys && otherKeys.length > 0 && (
            <section className="admin-settings-panel">
              <header>
                <span>Other</span>
                <h2>{title}</h2>
              </header>
              <div className="admin-form-grid">
                {otherKeys.map((key) => renderField(key))}
              </div>
            </section>
          )}
        </div>
      ) : (
        <section className="admin-settings-panel">
          <header>
            <span>Environment-aware configuration</span>
            <h2>{title}</h2>
          </header>
          <div className="admin-form-grid">
            {Object.keys(values).map((key) => renderField(key))}
          </div>
        </section>
      )}
    </>
  );
}
