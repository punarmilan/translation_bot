import { Crop, File, Image, RefreshCw, Search, Trash2, Upload, Video, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import AdminPageHeader from "../components/AdminPageHeader";
import EmptyState from "../components/EmptyState";
import { deleteModuleItem, getModule, replaceMedia, transformMedia, updateMedia, uploadMedia } from "../services/api";

function iconFor(type = "") {
  if (type.startsWith("image/")) return <Image size={20} />;
  if (type.startsWith("video/")) return <Video size={20} />;
  return <File size={20} />;
}

export default function MediaPage() {
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [cropTarget, setCropTarget] = useState(null);
  const [editing, setEditing] = useState(null);
  const [crop, setCrop] = useState({ x: 0, y: 0, width: 640, height: 360 });
  const uploadRef = useRef(null);
  const replaceRef = useRef(null);
  const replaceTarget = useRef(null);
  const load = () => getModule("media", { search }).then((data) => setItems(data.items || []));
  useEffect(load, []);

  const sendFile = async (file) => {
    const form = new FormData(); form.append("file", file); form.append("alt_text", "");
    await uploadMedia(form); setMessage("Media uploaded"); load();
  };
  const replace = async (file) => {
    const form = new FormData(); form.append("file", file);
    await replaceMedia(replaceTarget.current.media_id, form); setMessage("Media replaced"); load();
  };
  const remove = async (item) => {
    if (!window.confirm(`Delete ${item.original_name}?`)) return;
    await deleteModuleItem("media", item.media_id); load();
  };
  const compress = async (item) => {
    await transformMedia(item.media_id, { operation: "compress", quality: 78 }); setMessage("Image compressed"); load();
  };
  const applyCrop = async () => {
    await transformMedia(cropTarget.media_id, { operation: "crop", ...crop });
    setCropTarget(null); setMessage("Image cropped"); load();
  };
  const saveMetadata = async () => {
    await updateMedia(editing.media_id, { original_name: editing.original_name, alt_text: editing.alt_text || "", folder: editing.folder || "" });
    setEditing(null); setMessage("Media updated"); load();
  };

  return <>
    <AdminPageHeader eyebrow="Assets" title="Media Library" description="Upload, replace, compress, crop, and organize website images, videos, icons, and documents.">
      <button className="admin-button admin-button--primary" onClick={() => uploadRef.current?.click()}><Upload size={15} />Upload media</button>
    </AdminPageHeader>
    {message && <div className="admin-alert">{message}</div>}
    <section className="admin-toolbar"><label><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => event.key === "Enter" && load()} placeholder="Search assets" /></label><button className="admin-button admin-button--secondary" onClick={load}>Search</button></section>
    <input ref={uploadRef} hidden type="file" accept="image/*,video/*,.pdf,.docx,.txt" onChange={(event) => event.target.files?.[0] && sendFile(event.target.files[0])} />
    <input ref={replaceRef} hidden type="file" onChange={(event) => event.target.files?.[0] && replace(event.target.files[0])} />
    {items.length === 0 ? <EmptyState title="No media uploaded" description="Upload the first asset for website content." /> :
      <section className="admin-media-grid">{items.map((item) => <article key={item.media_id}>
        <div className="admin-media-preview">{item.content_type?.startsWith("image/") ? <img src={`${import.meta.env.VITE_ADMIN_API_URL || ""}${item.url}`} alt={item.alt_text || item.original_name} /> : iconFor(item.content_type)}</div>
        <div className="admin-media-meta"><strong>{item.original_name}</strong><small>{item.content_type} · {Math.ceil(item.size / 1024)} KB</small></div>
        <footer><button title="Rename or move" onClick={() => setEditing(item)}>Edit</button><button title="Replace" onClick={() => { replaceTarget.current = item; replaceRef.current?.click(); }}><RefreshCw size={14} /></button>{item.content_type?.startsWith("image/") && <><button title="Crop" onClick={() => setCropTarget(item)}><Crop size={14} /></button><button onClick={() => compress(item)}>Compress</button></>}<button className="is-danger" title="Delete" onClick={() => remove(item)}><Trash2 size={14} /></button></footer>
      </article>)}</section>}
    {editing && <div className="admin-modal-backdrop" onMouseDown={() => setEditing(null)}><section className="admin-modal" onMouseDown={(event) => event.stopPropagation()}><header><div><span>Asset metadata</span><h2>Edit media</h2></div><button onClick={() => setEditing(null)}><X /></button></header><label>File name<input value={editing.original_name || ""} onChange={(event) => setEditing({ ...editing, original_name: event.target.value })} /></label><label>Folder<input value={editing.folder || ""} onChange={(event) => setEditing({ ...editing, folder: event.target.value })} placeholder="landing, icons, docs" /></label><label>Alt text<textarea value={editing.alt_text || ""} onChange={(event) => setEditing({ ...editing, alt_text: event.target.value })} /></label><button className="admin-button admin-button--primary" onClick={saveMetadata}>Save metadata</button></section></div>}
    {cropTarget && <div className="admin-modal-backdrop" onMouseDown={() => setCropTarget(null)}><section className="admin-modal" onMouseDown={(event) => event.stopPropagation()}><header><div><span>Image editor</span><h2>Crop {cropTarget.original_name}</h2></div><button onClick={() => setCropTarget(null)}><X /></button></header><div className="admin-form-grid">{Object.entries(crop).map(([key, value]) => <label key={key}>{key}<input type="number" min="0" value={value} onChange={(event) => setCrop({ ...crop, [key]: Number(event.target.value) })} /></label>)}</div><button className="admin-button admin-button--primary" onClick={applyCrop}><Crop size={15} />Apply crop</button></section></div>}
  </>;
}
