import { CheckCircle2, Edit3, FileText, Save, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import AdminPageHeader from "../components/AdminPageHeader";
import StatusBadge from "../components/StatusBadge";
import { getModule, updateModuleItem } from "../services/api";

function ContentField({ name, value, onChange }) {
  if (typeof value === "string" || value == null) {
    const long = ["body", "description", "tagline"].includes(name);
    return <label>{name.replaceAll("_", " ")}{long
      ? <textarea value={value || ""} onChange={(event) => onChange(event.target.value)} />
      : <input value={value || ""} onChange={(event) => onChange(event.target.value)} />}</label>;
  }
  return <StructuredField name={name} value={value} onChange={onChange} />;
}

function StructuredField({ name, value, onChange }) {
  const [raw, setRaw] = useState(JSON.stringify(value, null, 2));
  useEffect(() => setRaw(JSON.stringify(value, null, 2)), [value]);
  return <label>{name.replaceAll("_", " ")}<textarea className="admin-code-input" value={raw} onChange={(event) => setRaw(event.target.value)} onBlur={() => {
    try { onChange(JSON.parse(raw)); } catch { /* Preserve text so the editor can correct invalid JSON. */ }
  }} /></label>;
}

export default function ContentPage() {
  const [items, setItems] = useState([]);
  const [selectedKey, setSelectedKey] = useState("");
  const [draft, setDraft] = useState(null);
  const [message, setMessage] = useState("");
  const selected = useMemo(() => items.find((item) => item.key === selectedKey), [items, selectedKey]);

  const load = () => getModule("content").then((data) => {
    setItems(data.items || []);
    setSelectedKey((current) => current || data.items?.[0]?.key || "");
  });
  useEffect(load, []);
  useEffect(() => setDraft(selected ? structuredClone(selected) : null), [selected]);

  const save = async (status) => {
    const updated = await updateModuleItem("content", draft.key, { content: draft.content, status, label: draft.label });
    setItems((current) => current.map((item) => item.key === updated.key ? updated : item));
    setMessage(status === "published" ? "Content published" : "Draft saved");
  };

  return <>
    <AdminPageHeader eyebrow="Website" title="Content Management" description="Edit and publish website copy, structured sections, calls to action, testimonials, pricing, FAQs, and media references without changing React code." />
    {message && <div className="admin-alert">{message}<button onClick={() => setMessage("")}><X size={14} /></button></div>}
    <section className="admin-editor-layout">
      <aside className="admin-section-list">
        <header><FileText size={17} /><strong>Website sections</strong></header>
        {items.map((item) => <button key={item.key} className={item.key === selectedKey ? "is-active" : ""} onClick={() => setSelectedKey(item.key)}>
          <span><strong>{item.label}</strong><small>{item.page} · v{item.version || 1}</small></span><StatusBadge value={item.status} />
        </button>)}
      </aside>
      <article className="admin-content-editor">
        {draft && <><header><div><span>{draft.page}</span><h2>{draft.label}</h2><p>{draft.key}</p></div><Edit3 size={19} /></header>
          <div className="admin-form-grid">{Object.entries(draft.content || {}).map(([name, value]) => <ContentField key={name} name={name} value={value} onChange={(next) => setDraft({ ...draft, content: { ...draft.content, [name]: next } })} />)}</div>
          <footer><button className="admin-button admin-button--secondary" onClick={() => save("draft")}><Save size={15} />Save draft</button><button className="admin-button admin-button--primary" onClick={() => save("published")}><CheckCircle2 size={15} />Publish</button></footer>
        </>}
      </article>
    </section>
  </>;
}
