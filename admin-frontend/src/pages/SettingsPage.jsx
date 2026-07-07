import { Save } from "lucide-react";
import { useEffect, useState } from "react";
import AdminPageHeader from "../components/AdminPageHeader";
import { getModule, updateModuleSettings } from "../services/api";

export default function SettingsPage({ module = "settings", title = "Settings", description, eyebrow = "Configuration" }) {
  const [values, setValues] = useState({});
  const [message, setMessage] = useState("");
  useEffect(() => { getModule(module).then((data) => setValues(data.values || {})); }, [module]);
  const updateValue = (key, rawValue, currentValue) => {
    let value = rawValue;
    if (typeof currentValue === "number") value = Number(rawValue);
    if (typeof currentValue === "boolean") value = rawValue === "true";
    setValues({ ...values, [key]: value });
  };
  const save = async () => { await updateModuleSettings(module, values); setMessage("Settings saved"); };
  return <><AdminPageHeader eyebrow={eyebrow} title={title} description={description}><button className="admin-button admin-button--primary" onClick={save}><Save size={15} />Save settings</button></AdminPageHeader>
    {message && <div className="admin-alert">{message}</div>}
    <section className="admin-settings-panel"><header><span>Environment-aware configuration</span><h2>{title}</h2></header><div className="admin-form-grid">{Object.entries(values).map(([key, value]) => <label key={key}>{key.replaceAll("_", " ")}{typeof value === "boolean"
      ? <select value={String(value)} onChange={(event) => updateValue(key, event.target.value, value)}><option value="true">Enabled</option><option value="false">Disabled</option></select>
      : <input type={typeof value === "number" ? "number" : "text"} value={value ?? ""} onChange={(event) => updateValue(key, event.target.value, value)} />}</label>)}</div></section>
  </>;
}
