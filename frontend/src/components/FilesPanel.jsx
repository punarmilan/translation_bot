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
import { BASE_URL } from "../services/api";

export default function FilesPanel({
  roomId,
  sessionId,
  username,
  socket,
  initialFiles = [],
  currentUserRole,
  allowUploads = true,
}) {
  const [files, setFiles] = useState(initialFiles || []);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [previewFile, setPreviewFile] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const fileInputRef = useRef(null);

  const fetchFiles = async () => {
    try {
      const res = await fetch(`${BASE_URL}/api/meetings/${roomId}/files`);
      if (res.ok) {
        const data = await res.json();
        setFiles(data.files || []);
      }
    } catch (err) {
      console.warn("Failed to load files", err);
    }
  };

  useEffect(() => {
    setFiles(initialFiles || []);
  }, [initialFiles]);

  useEffect(() => {
    fetchFiles();
  }, [roomId]);



  const handleUpload = async (selectedFile) => {
    if (!selectedFile || !allowUploads) return;
    
    // Front-end size check (25MB)
    const MAX_SIZE = 25 * 1024 * 1024;
    if (selectedFile.size > MAX_SIZE) {
      setErrorMsg("File size exceeds the maximum limit of 25MB.");
      setSuccessMsg("");
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    setErrorMsg("");
    setSuccessMsg("");

    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("username", username);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${BASE_URL}/api/meetings/${roomId}/files/upload`);
    
    // Authorization header
    const token = localStorage.getItem("access_token");
    if (token) {
      xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    }

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const percent = Math.round((event.loaded / event.total) * 100);
        setUploadProgress(percent);
      }
    };

    xhr.onload = () => {
      setUploading(false);
      setUploadProgress(0);
      if (xhr.status >= 200 && xhr.status < 300) {
        setSuccessMsg(`"${selectedFile.name}" uploaded successfully!`);
        setErrorMsg("");
        fetchFiles();
        setTimeout(() => setSuccessMsg(""), 4000);
      } else {
        let msg = "Upload failed.";
        try {
          const resJson = JSON.parse(xhr.responseText);
          msg = resJson.detail || msg;
        } catch {}
        setErrorMsg(msg);
        setSuccessMsg("");
      }
    };

    xhr.onerror = () => {
      setUploading(false);
      setUploadProgress(0);
      setErrorMsg("Network error during file upload.");
      setSuccessMsg("");
    };

    xhr.send(formData);
  };

  const handleDelete = async (fileId) => {
    if (!confirm("Are you sure you want to delete this file?")) return;
    try {
      const res = await fetch(`${BASE_URL}/api/meetings/${roomId}/files/${fileId}?session_id=${sessionId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        fetchFiles();
        setSuccessMsg("File deleted.");
        setTimeout(() => setSuccessMsg(""), 3000);
      } else {
        const errorData = await res.json();
        setErrorMsg(errorData.detail || "Delete failed.");
      }
    } catch (err) {
      setErrorMsg("Error deleting file.");
    }
  };

  const formatBytes = (bytes) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
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
    <div className="flex h-full flex-col bg-brand-dark p-4 rounded-large border border-white/[0.06] select-none text-brand-bg">
      <div className="mb-4 pb-3 border-b border-white/[0.06]">
        <h3 className="text-sm font-semibold">Shared Files</h3>
        <p className="text-[10px] text-ui-subtle">Share templates, slides, pictures, or screen records</p>
      </div>

      {/* Drop Zone */}
      {allowUploads ? (
        <div
          onDragOver={(e) => { e.preventDefault(); if (allowUploads) setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); if (allowUploads && e.dataTransfer.files[0]) handleUpload(e.dataTransfer.files[0]); }}
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
            onChange={(e) => { if (e.target.files[0]) handleUpload(e.target.files[0]); }}
            className="hidden"
            accept=".pdf,.docx,.doc,.ppt,.pptx,.png,.jpg,.jpeg,.gif,.webp,.mp3,.wav,.m4a,.ogg,.mp4,.webm,.mov,.avi"
          />
          {uploading ? (
            <div className="w-full flex flex-col items-center gap-1.5">
              <Loader2 size={24} className="text-brand-accent animate-spin" />
              <span className="text-xs font-semibold text-brand-accent">Uploading: {uploadProgress}%</span>
              <div className="w-full bg-white/10 h-1.5 rounded-full overflow-hidden mt-1 max-w-[180px]">
                <div className="bg-brand-accent h-full transition-all duration-150" style={{ width: `${uploadProgress}%` }} />
              </div>
            </div>
          ) : (
            <>
              <UploadCloud size={24} className="text-ui-muted" />
              <span className="text-xs font-medium">Click or drag file here</span>
              <span className="text-[9px] text-ui-subtle">PDF, DOCX, PPTX, Images, Audio, Video (Max 25MB)</span>
            </>
          )}
        </div>
      ) : (
        <div className="p-3 bg-white/[0.02] border border-white/[0.04] text-xs text-ui-subtle text-center rounded-control">
          Uploading is disabled by meeting host.
        </div>
      )}

      {/* Alert Messaging */}
      {errorMsg && (
        <div className="mt-3 flex items-center justify-between p-2 rounded bg-ui-danger/10 border border-ui-danger/25 text-xs text-ui-danger">
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg("")} className="ml-2 hover:brightness-110 font-bold"><X size={13} /></button>
        </div>
      )}
      {successMsg && (
        <div className="mt-3 flex items-center justify-between p-2 rounded bg-ui-success/10 border border-ui-success/25 text-xs text-ui-success">
          <span>{successMsg}</span>
          <button onClick={() => setSuccessMsg("")} className="ml-2 hover:brightness-110 font-bold"><X size={13} /></button>
        </div>
      )}

      {/* Files List */}
      <div className="flex-1 mt-4 overflow-y-auto max-h-[350px] space-y-2 pr-1 meeting-scroll">
        {files.length === 0 ? (
          <div className="p-6 text-center text-xs text-ui-subtle">No files shared yet in this meeting.</div>
        ) : (
          files.map((file) => (
            <div
              key={file.file_id}
              className="flex items-center justify-between p-2.5 bg-ui-secondary rounded-control border border-white/[0.02] hover:bg-white/[0.03] transition duration-150"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="p-1.5 bg-brand-dark/30 rounded">{getFileIcon(file.content_type)}</div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold truncate" title={file.filename}>
                    {file.filename}
                  </p>
                  <p className="text-[9px] text-ui-subtle">
                    {formatBytes(file.size)} • By {file.uploaded_by}
                  </p>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button
                  onClick={() => setPreviewFile(file)}
                  className="p-1.5 rounded hover:bg-white/[0.06] text-ui-muted hover:text-brand-bg transition"
                  title="Preview File"
                >
                  <Eye size={13} />
                </button>
                <a
                  href={`${BASE_URL}/api/meetings/${roomId}/files/${file.file_id}/download`}
                  download={file.filename}
                  className="p-1.5 rounded hover:bg-white/[0.06] text-ui-muted hover:text-brand-bg transition"
                  title="Download File"
                >
                  <Download size={13} />
                </a>
                {canDelete && (
                  <button
                    onClick={() => handleDelete(file.file_id)}
                    className="p-1.5 rounded hover:bg-white/[0.06] text-ui-danger/70 hover:text-ui-danger transition"
                    title="Delete File"
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
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" onMouseDown={() => setPreviewFile(null)}>
          <div className="bg-ui-secondary border border-white/10 rounded-2xl p-4 w-full max-w-2xl flex flex-col max-h-[85vh] shadow-2xl relative" onMouseDown={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-white/5 pb-2 mb-3">
              <h3 className="text-xs font-bold truncate max-w-[80%]">{previewFile.filename}</h3>
              <button onClick={() => setPreviewFile(null)} className="text-ui-muted hover:text-brand-bg font-bold text-xs"><X size={15} /></button>
            </div>
            <div className="flex-1 overflow-auto flex items-center justify-center bg-brand-dark/20 rounded p-2">
              {previewFile.content_type?.startsWith("image/") ? (
                <img src={`${BASE_URL}/api/meetings/${roomId}/files/${previewFile.file_id}/download`} alt={previewFile.filename} className="max-w-full max-h-[60vh] object-contain rounded" />
              ) : previewFile.content_type?.startsWith("video/") ? (
                <video src={`${BASE_URL}/api/meetings/${roomId}/files/${previewFile.file_id}/download`} controls className="max-w-full max-h-[60vh] rounded" />
              ) : previewFile.content_type?.startsWith("audio/") ? (
                <audio src={`${BASE_URL}/api/meetings/${roomId}/files/${previewFile.file_id}/download`} controls className="w-full max-w-md" />
              ) : (
                <div className="text-center p-8 text-xs text-ui-subtle">
                  Preview not supported for this file type.
                  <a href={`${BASE_URL}/api/meetings/${roomId}/files/${previewFile.file_id}/download`} className="block mt-4 text-brand-accent underline">Download and view locally</a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
