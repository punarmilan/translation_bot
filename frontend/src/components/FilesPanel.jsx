import React, { useState, useEffect, useRef } from "react";
import {
  UploadCloud,
  FileText,
  FileImage,
  FileVideo,
  Download,
  Trash2,
  Eye,
  X,
  Loader2,
} from "lucide-react";

export default function FilesPanel({
  roomId,
  sessionId,
  username,
  socket,
  currentUserRole,
  allowUploads = true,
}) {
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [previewFile, setPreviewFile] = useState(null);
  const fileInputRef = useRef(null);

  const fetchFiles = async () => {
    try {
      const res = await fetch(`/api/meetings/${roomId}/files`);
      if (res.ok) {
        const data = await res.json();
        setFiles(data.files || []);
      }
    } catch (err) {
      console.warn("Failed to load files", err);
    }
  };

  useEffect(() => {
    fetchFiles();
  }, [roomId]);

  // WebSocket Listener for new file events or deletions
  useEffect(() => {
    if (!socket) return;
    const handleWsMessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.room_id === roomId) {
          if (data.type === "file_uploaded" || data.type === "file_deleted") {
            fetchFiles();
          }
        }
      } catch (err) {
        // Silent error
      }
    };
    socket.addEventListener("message", handleWsMessage);
    return () => socket.removeEventListener("message", handleWsMessage);
  }, [socket, roomId]);

  const handleUpload = async (selectedFile) => {
    if (!selectedFile || !allowUploads) return;
    setUploading(true);
    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("username", username);

    try {
      const res = await fetch(`/api/meetings/${roomId}/files/upload`, {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        fetchFiles();
      } else {
        alert("Upload failed. File type or size restriction may apply.");
      }
    } catch (err) {
      alert("Error uploading file.");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (fileId) => {
    if (!confirm("Are you sure you want to delete this file?")) return;
    try {
      const res = await fetch(`/api/meetings/${roomId}/files/${fileId}?session_id=${sessionId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        fetchFiles();
      } else {
        const errorData = await res.json();
        alert(errorData.detail || "Delete failed.");
      }
    } catch (err) {
      alert("Error deleting file.");
    }
  };

  // Helper to format bytes
  const formatBytes = (bytes) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  // Drag and drop handlers
  const onDragOver = (e) => {
    e.preventDefault();
    if (allowUploads) setDragOver(true);
  };

  const onDragLeave = () => {
    setDragOver(false);
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (!allowUploads) return;
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      handleUpload(droppedFile);
    }
  };

  const getFileIcon = (contentType = "") => {
    const type = contentType.toLowerCase();
    if (type.includes("pdf") || type.includes("word") || type.includes("officedocument") || type.includes("presentation")) {
      return <FileText size={18} className="text-red-400" />;
    }
    if (type.includes("image")) {
      return <FileImage size={18} className="text-emerald-400" />;
    }
    if (type.includes("video")) {
      return <FileVideo size={18} className="text-sky-400" />;
    }
    return <FileText size={18} className="text-ui-muted" />;
  };

  const canDelete = currentUserRole === "host" || currentUserRole === "admin" || currentUserRole === "co-host";

  return (
    <div className="flex h-full flex-col bg-brand-dark p-4 rounded-large border border-white/[0.06]">
      <div className="mb-4 pb-3 border-b border-white/[0.06]">
        <h3 className="text-sm font-semibold text-brand-bg">Shared Files</h3>
        <p className="text-[10px] text-ui-subtle">Upload documents, presentations, images or videos</p>
      </div>

      {/* Drop Zone */}
      {allowUploads ? (
        <div
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`cursor-pointer border-2 border-dashed rounded-large p-5 flex flex-col items-center justify-center gap-2 transition ${
            dragOver
              ? "border-brand-accent bg-brand-accent/5"
              : "border-white/10 hover:border-white/20 hover:bg-white/[0.01]"
          }`}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={(e) => handleUpload(e.target.files[0])}
            className="hidden"
            accept=".pdf,.docx,.doc,.ppt,.pptx,image/*,video/*"
          />
          {uploading ? (
            <>
              <Loader2 size={24} className="text-brand-accent animate-spin" />
              <span className="text-xs font-semibold text-brand-accent">Uploading file...</span>
            </>
          ) : (
            <>
              <UploadCloud size={24} className="text-ui-muted" />
              <span className="text-xs font-medium text-brand-bg/85">Click or drag file here</span>
              <span className="text-[9px] text-ui-subtle">PDF, DOCX, PPT, Images, Videos</span>
            </>
          )}
        </div>
      ) : (
        <div className="p-3 bg-white/[0.02] border border-white/[0.04] text-xs text-ui-subtle text-center rounded-control">
          Uploading is disabled by meeting host.
        </div>
      )}

      {/* Files List */}
      <div className="flex-1 mt-4 overflow-y-auto max-h-[350px] space-y-2 pr-1 meeting-scroll">
        {files.length === 0 ? (
          <div className="p-4 text-center text-xs text-ui-subtle">No files shared yet in this meeting.</div>
        ) : (
          files.map((file) => (
            <div
              key={file.file_id}
              className="flex items-center justify-between p-2.5 bg-ui-secondary rounded-control border border-white/[0.02]"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="p-1.5 bg-brand-dark/30 rounded">{getFileIcon(file.content_type)}</div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-brand-bg truncate" title={file.filename}>
                    {file.filename}
                  </p>
                  <p className="text-[9px] text-ui-subtle">
                    {formatBytes(file.size)} • By {file.uploaded_by}
                  </p>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setPreviewFile(file)}
                  className="p-1.5 hover:bg-white/[0.06] text-ui-muted hover:text-brand-bg rounded"
                  title="Preview file"
                >
                  <Eye size={13} />
                </button>
                <a
                  href={`/api/meetings/${roomId}/files/${file.file_id}/download`}
                  download={file.filename}
                  className="p-1.5 hover:bg-white/[0.06] text-ui-muted hover:text-brand-bg rounded block"
                  title="Download file"
                >
                  <Download size={13} />
                </a>
                {canDelete && (
                  <button
                    onClick={() => handleDelete(file.file_id)}
                    className="p-1.5 hover:bg-ui-danger/10 text-ui-muted hover:text-ui-danger rounded"
                    title="Delete file"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Preview Modal */}
      {previewFile && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="relative bg-brand-mid rounded-large border border-white/10 w-full max-w-3xl flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between p-3.5 border-b border-white/[0.06]">
              <h4 className="text-sm font-semibold text-brand-bg truncate pr-5">{previewFile.filename}</h4>
              <button
                onClick={() => setPreviewFile(null)}
                className="text-ui-muted hover:text-brand-bg p-1 hover:bg-white/[0.06] rounded"
              >
                <X size={16} />
              </button>
            </div>
            
            <div className="flex-1 bg-brand-dark/20 p-4 flex items-center justify-center overflow-auto">
              {previewFile.content_type.startsWith("image/") ? (
                <img
                  src={`/api/meetings/${roomId}/files/${previewFile.file_id}/download`}
                  alt={previewFile.filename}
                  className="max-w-full max-h-[60vh] object-contain rounded"
                />
              ) : previewFile.content_type.startsWith("video/") ? (
                <video
                  src={`/api/meetings/${roomId}/files/${previewFile.file_id}/download`}
                  controls
                  className="max-w-full max-h-[60vh] rounded"
                />
              ) : previewFile.content_type.startsWith("audio/") ? (
                <audio
                  src={`/api/meetings/${roomId}/files/${previewFile.file_id}/download`}
                  controls
                  className="w-full max-w-md"
                />
              ) : previewFile.content_type.includes("pdf") ? (
                <iframe
                  src={`/api/meetings/${roomId}/files/${previewFile.file_id}/download`}
                  title={previewFile.filename}
                  className="w-full h-[60vh] rounded border-0"
                />
              ) : (
                <div className="text-center p-5">
                  <FileText size={48} className="mx-auto text-ui-muted mb-3" />
                  <p className="text-sm text-brand-bg mb-2">No preview available for this file type</p>
                  <a
                    href={`/api/meetings/${roomId}/files/${previewFile.file_id}/download`}
                    download
                    className="inline-flex items-center gap-1 bg-brand-accent hover:brightness-110 text-white text-xs font-semibold px-4 py-2 rounded-control"
                  >
                    <Download size={13} />
                    Download File
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
