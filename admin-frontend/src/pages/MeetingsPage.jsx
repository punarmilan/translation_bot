import { Download, FileClock, LogOut, Search, UserRoundX, X } from "lucide-react";
import { useEffect, useState } from "react";
import AdminPageHeader from "../components/AdminPageHeader";
import StatusBadge from "../components/StatusBadge";
import { getMeetings, meetingAction } from "../services/api";

function formatDuration(seconds) {
  if (seconds == null) return "-";
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
}

export default function MeetingsPage() {
  const [data, setData] = useState({ items: [], total: 0 });
  const [filters, setFilters] = useState({ search: "", status: "", page: 1, page_size: 20 });
  const [message, setMessage] = useState("");
  const [kickRoom, setKickRoom] = useState(null);
  const [participantId, setParticipantId] = useState("");

  const load = () => getMeetings(filters)
    .then(setData)
    .catch((error) => setMessage(error.response?.data?.detail || "Could not load meetings"));

  useEffect(load, [filters.page, filters.status]);

  const endMeeting = async (meeting) => {
    if (!window.confirm(`End ${meeting.meeting_name}?`)) return;
    const result = await meetingAction(meeting.room_id, "end");
    setMessage(result.note || "End meeting command queued");
    load();
  };

  const kickParticipant = async () => {
    if (!participantId.trim()) return;
    const result = await meetingAction(kickRoom.room_id, "kick", { participant_id: participantId.trim() });
    setMessage(result.note || "Kick participant command queued");
    setKickRoom(null);
    setParticipantId("");
  };

  const exportMeeting = async (meeting) => {
    const response = await fetch(
      `${import.meta.env.VITE_ADMIN_API_URL || "http://127.0.0.1:8010"}/admin/meetings/${encodeURIComponent(meeting.room_id)}/export`,
      { headers: { Authorization: `Bearer ${localStorage.getItem("admin_access_token")}` } },
    );
    if (!response.ok) {
      setMessage("Meeting export failed");
      return;
    }
    const blob = new Blob([JSON.stringify(await response.json(), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${meeting.room_id}-export.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <AdminPageHeader eyebrow="Operations" title="Meetings" description="Inspect persisted room records and queue audited moderation commands." />
      {message && <div className="admin-alert">{message}<button onClick={() => setMessage("")} aria-label="Dismiss"><X size={14} /></button></div>}
      <section className="admin-toolbar">
        <label><Search size={16} /><input value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} onKeyDown={(event) => event.key === "Enter" && load()} placeholder="Search meeting name or room ID" /></label>
        <select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value, page: 1 })}>
          <option value="">All statuses</option><option value="active">Active</option><option value="ended">Ended</option>
        </select>
        <button className="admin-button admin-button--primary" onClick={load}>Search</button>
      </section>
      <section className="admin-table-panel">
        <div className="admin-table-scroll"><table><thead><tr><th>Meeting</th><th>Host</th><th>Participants</th><th>Duration</th><th>Languages</th><th>Status</th><th>Quality</th><th>Actions</th></tr></thead>
          <tbody>{data.items.map((meeting) => <tr key={meeting.meeting_id || meeting.room_id}>
            <td><strong>{meeting.meeting_name}</strong><small className="admin-table-subtitle">{meeting.room_id}</small></td>
            <td>{meeting.host}</td><td>{meeting.participants}</td><td>{formatDuration(meeting.duration_seconds)}</td>
            <td>{meeting.languages?.length ? meeting.languages.join(", ") : "-"}</td><td><StatusBadge value={meeting.status} /></td>
            <td><StatusBadge value={meeting.connection_quality} /></td>
            <td><div className="admin-row-actions">
              <button title="End meeting" className="is-danger" disabled={meeting.status !== "active"} onClick={() => endMeeting(meeting)}><LogOut size={15} /></button>
              <button title="Kick participant" onClick={() => setKickRoom(meeting)}><UserRoundX size={15} /></button>
              <button title="Export meeting" onClick={() => exportMeeting(meeting)}><Download size={15} /></button>
              <button title="View logs" onClick={() => setMessage(`Translation logs are available from /admin/meetings/${meeting.room_id}/logs`)}><FileClock size={15} /></button>
            </div></td>
          </tr>)}</tbody></table></div>
        <footer><span>{data.total} meetings</span><div><button disabled={filters.page === 1} onClick={() => setFilters({ ...filters, page: filters.page - 1 })}>Previous</button><b>Page {filters.page}</b><button disabled={filters.page * filters.page_size >= data.total} onClick={() => setFilters({ ...filters, page: filters.page + 1 })}>Next</button></div></footer>
      </section>
      {kickRoom && <div className="admin-modal-backdrop" onMouseDown={() => setKickRoom(null)}><section className="admin-modal" onMouseDown={(event) => event.stopPropagation()}>
        <header><div><span>Meeting moderation</span><h2>Kick participant</h2></div><button onClick={() => setKickRoom(null)} aria-label="Close"><X /></button></header>
        <p>Enter the participant session ID for <strong>{kickRoom.meeting_name}</strong>.</p>
        <label>Participant session ID<input value={participantId} onChange={(event) => setParticipantId(event.target.value)} placeholder="Session ID" /></label>
        <button className="admin-button admin-button--danger" onClick={kickParticipant}>Queue kick command</button>
      </section></div>}
    </>
  );
}
