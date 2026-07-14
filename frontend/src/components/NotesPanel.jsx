import React, { useState, useEffect, useRef } from "react";
import { Download, Eye, Edit3, CheckCircle } from "lucide-react";

export default function NotesPanel({
  roomId,
  sessionId,
  socket,
  initialContent = "",
  allowEditing = true,
}) {
  const [content, setContent] = useState(initialContent);
  const [mode, setMode] = useState("edit"); // edit | preview
  const [syncStatus, setSyncStatus] = useState("Saved"); // Saved | Saving...
  const saveTimeoutRef = useRef(null);

  // Sync initial content
  useEffect(() => {
    setContent(initialContent);
  }, [initialContent]);

  // WebSocket Listener for incoming notes updates
  useEffect(() => {
    if (!socket) return;
    const handleWsMessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "notes_update" && data.room_id === roomId) {
          if (data.sender_session_id !== sessionId) {
            setContent(data.notes_content || "");
            setSyncStatus("Saved");
          }
        }
      } catch (err) {
        // Silent error
      }
    };
    socket.addEventListener("message", handleWsMessage);
    return () => socket.removeEventListener("message", handleWsMessage);
  }, [socket, roomId, sessionId]);

  const broadcastNotes = (newContent) => {
    if (!socket || !allowEditing) return;
    socket.send(
      JSON.stringify({
        type: "notes_update",
        room_id: roomId,
        notes_content: newContent,
      })
    );
  };

  const handleChange = (e) => {
    const val = e.target.value;
    setContent(val);
    setSyncStatus("Saving...");

    // Debounce broadcast
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      broadcastNotes(val);
      setSyncStatus("Saved");
    }, 400);
  };

  // Micro Markdown parser
  const renderMarkdown = (text) => {
    if (!text) return "<p class='text-ui-muted text-xs'>Start typing notes in Edit mode...</p>";
    
    // Escape HTML first
    let html = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    // Code Blocks
    html = html.replace(/```([\s\S]*?)```/g, (match, p1) => {
      return `<pre class="bg-brand-dark/50 p-3 rounded font-mono text-xs text-brand-accent overflow-x-auto my-3 border border-white/[0.04]">${p1.trim()}</pre>`;
    });

    // Inline Code
    html = html.replace(/`([^`\n]+)`/g, '<code class="bg-white/10 px-1 rounded font-mono text-xs text-amber-300">$1</code>');

    // Headings
    html = html.replace(/^### (.*$)/gim, '<h4 class="text-sm font-bold text-brand-bg mt-3 mb-1.5">$1</h4>');
    html = html.replace(/^## (.*$)/gim, '<h3 class="text-base font-bold text-brand-bg mt-4 mb-2">$1</h3>');
    html = html.replace(/^# (.*$)/gim, '<h2 class="text-lg font-extrabold text-brand-bg mt-5 mb-2.5 border-b border-white/[0.06] pb-1">$1</h2>');

    // Checkboxes
    html = html.replace(/^- \[\ \]\ (.*$)/gim, '<div class="flex items-center gap-2 text-xs text-brand-bg/90 my-1"><input type="checkbox" disabled class="rounded bg-brand-dark border-white/20" /> <span>$1</span></div>');
    html = html.replace(/^- \[x\]\ (.*$)/gim, '<div class="flex items-center gap-2 text-xs text-ui-muted my-1"><input type="checkbox" checked disabled class="rounded bg-brand-dark border-white/20" /> <span class="line-through opacity-60">$1</span></div>');

    // Bullet Lists
    html = html.replace(/^- (.*$)/gim, '<li class="list-disc ml-5 text-xs text-brand-bg/90 my-1">$1</li>');

    // Tables parsing
    html = html.replace(/^\|(.*)\|$/gim, (match, p1) => {
      const cols = p1.split("|").map(c => c.trim());
      const rowContent = cols.map(c => `<td class="border border-white/[0.06] p-2 text-xs">${c}</td>`).join("");
      return `<tr class="border-b border-white/[0.04]">${rowContent}</tr>`;
    });
    // Wrap consecutive table rows
    html = html.replace(/(<tr.*?>[\s\S]*?<\/tr>)+/g, '<table class="w-full border-collapse my-3 table-auto">$1</table>');

    // Paragraphs (split by double newline)
    html = html.split("\n\n").map(para => {
      if (para.trim().startsWith("<h") || para.trim().startsWith("<pre") || para.trim().startsWith("<table") || para.trim().startsWith("<li") || para.trim().startsWith("<div")) {
        return para;
      }
      return `<p class="text-xs leading-relaxed text-brand-bg/80 mb-2">${para.replace(/\n/g, "<br />")}</p>`;
    }).join("");

    return html;
  };

  const handleExportMarkdown = () => {
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `meeting-notes-${roomId}.md`;
    a.click();
  };

  const handleExportPdf = () => {
    // Generate simple print-style window
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`
      <html>
        <head>
          <title>Meeting Notes - ${roomId}</title>
          <style>
            body { font-family: system-ui, -apple-system, sans-serif; padding: 40px; color: #1f2937; line-height: 1.6; }
            h1 { border-bottom: 2px solid #e5e7eb; padding-bottom: 8px; margin-top: 30px; }
            h2 { margin-top: 24px; }
            pre { background: #f3f4f6; padding: 12px; border-radius: 6px; font-family: monospace; overflow-x: auto; }
            code { background: #f3f4f6; padding: 2px 4px; border-radius: 4px; font-family: monospace; }
            table { width: 100%; border-collapse: collapse; margin: 16px 0; }
            th, td { border: 1px solid #e5e7eb; padding: 8px 12px; text-align: left; }
            tr:nth-child(even) { background-color: #f9fafb; }
            .checkbox { display: flex; align-items: center; gap: 8px; margin: 4px 0; }
          </style>
        </head>
        <body>
          <h1>Meeting Notes - ${roomId}</h1>
          <div>${renderMarkdown(content)}</div>
          <script>
            window.onload = function() { window.print(); window.close(); }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="flex h-full flex-col bg-brand-dark p-4 rounded-large border border-white/[0.06]">
      {/* Header controls */}
      <div className="mb-4 flex items-center justify-between border-b border-white/[0.06] pb-3">
        <div className="flex items-center gap-2 bg-ui-secondary p-1 rounded-control">
          <button
            onClick={() => setMode("edit")}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-control transition ${
              mode === "edit" ? "bg-brand-accent text-white" : "text-ui-muted hover:text-brand-bg"
            }`}
          >
            <Edit3 size={13} />
            Edit
          </button>
          <button
            onClick={() => setMode("preview")}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-control transition ${
              mode === "preview" ? "bg-brand-accent text-white" : "text-ui-muted hover:text-brand-bg"
            }`}
          >
            <Eye size={13} />
            Preview
          </button>
        </div>

        {/* Action icons */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 text-[11px] text-ui-subtle">
            <CheckCircle size={12} className={syncStatus === "Saved" ? "text-ui-success" : "text-amber-400 animate-pulse"} />
            <span>{syncStatus}</span>
          </div>
          <div className="flex items-center gap-1.5 border-l border-white/[0.06] pl-3">
            <button
              onClick={handleExportMarkdown}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-control text-xs font-medium bg-ui-secondary text-brand-bg hover:bg-white/[0.06] transition"
              title="Export Markdown"
            >
              <Download size={13} />
              Markdown
            </button>
            <button
              onClick={handleExportPdf}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-control text-xs font-medium bg-ui-secondary text-brand-bg hover:bg-white/[0.06] transition"
              title="Export PDF"
            >
              <Download size={13} />
              PDF
            </button>
          </div>
        </div>
      </div>

      {/* Editor & Preview containers */}
      <div className="flex-1 min-h-[350px] flex flex-col">
        {mode === "edit" ? (
          <textarea
            value={content}
            onChange={handleChange}
            disabled={!allowEditing}
            className="w-full flex-1 bg-brand-dark/20 p-4 border border-white/[0.04] rounded-large text-sm leading-relaxed text-brand-bg placeholder:text-ui-subtle outline-none focus:border-brand-accent resize-none font-mono"
            placeholder={`# Meeting Title\n\nUse Markdown headers, bullet points, checklists, and code:\n\n- [ ] Task 1\n- [ ] Task 2\n\n| Item | Qty |\n| Pencil | 5 |`}
          />
        ) : (
          <div
            className="w-full flex-1 bg-brand-dark/10 p-5 border border-white/[0.04] rounded-large overflow-y-auto max-h-[480px] prose prose-invert select-text"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
          />
        )}
      </div>
    </div>
  );
}
