import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableHeader from "@tiptap/extension-table-header";
import TableCell from "@tiptap/extension-table-cell";
import {
  Bold, Italic, Underline as UnderlineIcon, Link as LinkIcon, List, ListOrdered,
  Quote, Code, Heading2, Heading3, Heading4, Table as TableIcon, Image as ImageIcon,
  Video, SquareMousePointer, Undo, Redo, Trash2, Search, Upload, RefreshCw, X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getModule, uploadMedia } from "../../services/api";
import ButtonExtension from "./tiptap/ButtonExtension";
import EmbedExtension from "./tiptap/EmbedExtension";

const ADMIN_API_URL = import.meta.env.VITE_ADMIN_API_URL || "";

function toEmbedUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.replace(/^www\./, "");
    if (host === "youtube.com" || host === "youtube-nocookie.com") {
      const videoId = url.searchParams.get("v") || url.pathname.split("/").pop();
      return videoId ? `https://www.youtube-nocookie.com/embed/${videoId}` : null;
    }
    if (host === "youtu.be") {
      const videoId = url.pathname.replace("/", "");
      return videoId ? `https://www.youtube-nocookie.com/embed/${videoId}` : null;
    }
    if (host === "vimeo.com") {
      const videoId = url.pathname.split("/").filter(Boolean).pop();
      return videoId ? `https://player.vimeo.com/video/${videoId}` : null;
    }
  } catch {
    return null;
  }
  return null;
}

function InlineMediaPicker({ onSelect, onClose }) {
  const [library, setLibrary] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    setLoading(true);
    const timeout = setTimeout(() => {
      getModule("media", { search })
        .then((data) => setLibrary(data.items || []))
        .catch(() => setLibrary([]))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(timeout);
  }, [search]);

  const handleUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const asset = await uploadMedia(form);
      if (asset?.url) onSelect(`${ADMIN_API_URL}${asset.url}`);
    } catch (err) {
      console.warn("Asset upload failed", err);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="admin-modal-backdrop" onMouseDown={onClose}>
      <section className="admin-modal admin-modal--wide" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div><span>Rich text</span><h2>Insert image from library</h2></div>
          <button onClick={onClose}><X /></button>
        </header>
        <div className="admin-toolbar">
          <label><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search assets" /></label>
          <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handleUpload} />
          <button type="button" className="admin-button admin-button--secondary" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
            {uploading ? <RefreshCw className="animate-spin" size={13} /> : <Upload size={13} />}
            Upload new
          </button>
        </div>
        {loading ? (
          <div className="admin-skeleton" />
        ) : library.length === 0 ? (
          <p className="admin-empty-copy">No media uploaded yet.</p>
        ) : (
          <section className="cms-asset-picker__grid">
            {library.filter((item) => item.content_type?.startsWith("image/")).map((item) => (
              <button
                type="button"
                key={item.media_id}
                className="cms-asset-picker__grid-item"
                onClick={() => onSelect(`${ADMIN_API_URL}${item.url}`)}
              >
                <img src={`${ADMIN_API_URL}${item.url}`} alt={item.alt_text || item.original_name} />
                <small>{item.original_name}</small>
              </button>
            ))}
          </section>
        )}
      </section>
    </div>
  );
}

function ToolbarButton({ onClick, active, disabled, title, children }) {
  return (
    <button
      type="button"
      className={`rt-toolbar__button${active ? " is-active" : ""}`}
      onMouseDown={(event) => { event.preventDefault(); onClick(); }}
      disabled={disabled}
      title={title}
    >
      {children}
    </button>
  );
}

/**
 * Reusable rich-text (WYSIWYG) editor for CMS "richtext" fields, backed by
 * TipTap/ProseMirror. Saves sanitized-on-write HTML (see
 * admin-backend/app/cms/sanitize.py -- this editor is intentionally not the
 * security boundary, just the authoring surface). Reused across every CMS
 * page/section that has a "richtext" field -- there is no per-page or
 * per-section-type copy of this component.
 */
export default function RichTextEditor({ value, onChange, placeholder }) {
  const [pickingImage, setPickingImage] = useState(false);
  const lastEmittedHtml = useRef(value || "");

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3, 4] } }),
      Underline,
      Link.configure({ openOnClick: false, autolink: true }),
      Image,
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      ButtonExtension,
      EmbedExtension,
    ],
    content: value || "",
    onUpdate: ({ editor: instance }) => {
      const html = instance.isEmpty ? "" : instance.getHTML();
      lastEmittedHtml.current = html;
      onChange(html);
    },
    editorProps: {
      attributes: { class: "rt-content", "data-placeholder": placeholder || "" },
    },
  });

  // Keep the editor in sync when a different section's value is loaded in
  // (switching sections in SectionEditor swaps `value` out from under us).
  useEffect(() => {
    if (!editor) return;
    const incoming = value || "";
    if (incoming !== lastEmittedHtml.current && incoming !== editor.getHTML()) {
      editor.commands.setContent(incoming, false);
      lastEmittedHtml.current = incoming;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editor]);

  useEffect(() => () => editor?.destroy(), [editor]);

  if (!editor) return null;

  const setLink = () => {
    const previous = editor.getAttributes("link").href || "";
    const url = window.prompt("Link URL", previous);
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };

  const insertEmbed = () => {
    const url = window.prompt("Video URL (YouTube or Vimeo)");
    if (!url) return;
    const embedUrl = toEmbedUrl(url.trim());
    if (!embedUrl) {
      window.alert("Only YouTube and Vimeo links are supported for embeds.");
      return;
    }
    editor.chain().focus().setEmbed({ src: embedUrl }).run();
  };

  const insertButton = () => {
    const label = window.prompt("Button label", "Learn more");
    if (!label) return;
    const href = window.prompt("Button link", "/");
    if (href === null) return;
    editor.chain().focus().setCtaButton({ label, href }).run();
  };

  const insertTable = () => {
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  };

  return (
    <div className="rt-editor">
      <div className="rt-toolbar">
        <ToolbarButton title="Heading 2" active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 size={15} /></ToolbarButton>
        <ToolbarButton title="Heading 3" active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}><Heading3 size={15} /></ToolbarButton>
        <ToolbarButton title="Heading 4" active={editor.isActive("heading", { level: 4 })} onClick={() => editor.chain().focus().toggleHeading({ level: 4 }).run()}><Heading4 size={15} /></ToolbarButton>
        <span className="rt-toolbar__divider" />
        <ToolbarButton title="Bold" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}><Bold size={15} /></ToolbarButton>
        <ToolbarButton title="Italic" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic size={15} /></ToolbarButton>
        <ToolbarButton title="Underline" active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}><UnderlineIcon size={15} /></ToolbarButton>
        <ToolbarButton title="Link" active={editor.isActive("link")} onClick={setLink}><LinkIcon size={15} /></ToolbarButton>
        <span className="rt-toolbar__divider" />
        <ToolbarButton title="Bullet list" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}><List size={15} /></ToolbarButton>
        <ToolbarButton title="Numbered list" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered size={15} /></ToolbarButton>
        <ToolbarButton title="Blockquote" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}><Quote size={15} /></ToolbarButton>
        <ToolbarButton title="Code block" active={editor.isActive("codeBlock")} onClick={() => editor.chain().focus().toggleCodeBlock().run()}><Code size={15} /></ToolbarButton>
        <span className="rt-toolbar__divider" />
        <ToolbarButton title="Insert table" onClick={insertTable}><TableIcon size={15} /></ToolbarButton>
        {editor.isActive("table") && (
          <ToolbarButton title="Delete table" onClick={() => editor.chain().focus().deleteTable().run()}><Trash2 size={15} /></ToolbarButton>
        )}
        <ToolbarButton title="Insert image from library" onClick={() => setPickingImage(true)}><ImageIcon size={15} /></ToolbarButton>
        <ToolbarButton title="Insert video embed" onClick={insertEmbed}><Video size={15} /></ToolbarButton>
        <ToolbarButton title="Insert button" onClick={insertButton}><SquareMousePointer size={15} /></ToolbarButton>
        <span className="rt-toolbar__divider" />
        <ToolbarButton title="Undo" onClick={() => editor.chain().focus().undo().run()}><Undo size={15} /></ToolbarButton>
        <ToolbarButton title="Redo" onClick={() => editor.chain().focus().redo().run()}><Redo size={15} /></ToolbarButton>
      </div>
      <EditorContent editor={editor} />
      {pickingImage && (
        <InlineMediaPicker
          onClose={() => setPickingImage(false)}
          onSelect={(src) => {
            editor.chain().focus().setImage({ src }).run();
            setPickingImage(false);
          }}
        />
      )}
    </div>
  );
}
